/**
 * SpeedCrawl Pro v14.0 - Workflow Manager
 * Orchestrates multi-step form workflows and OTP handling
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class WorkflowManager extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;
    
    this.activeWorkflows = new Map();
    this.completedWorkflows = [];
    this.maxSteps = this.config.get('maxFormSteps', 4);
    this.stepDelay = this.config.get('formDelay', 1000);
  }

  async processWorkflow(form, formStructure, fingerprint, page) {
    try {
      const workflowId = this.generateWorkflowId(fingerprint);
      
      this.logger.info(`🔄 Starting workflow: ${workflowId}`);
      
      const workflow = {
        id: workflowId,
        fingerprint: fingerprint,
        startTime: Date.now(),
        currentStep: 0,
        steps: [],
        status: 'active',
        page: page,
        totalSteps: 0
      };

      this.activeWorkflows.set(workflowId, workflow);

      // Detect workflow type
      const workflowType = this.detectWorkflowType(formStructure);
      this.logger.debug(`Detected workflow type: ${workflowType}`);

      // Execute workflow based on type
      let result;
      switch (workflowType) {
        case 'otp_flow':
          result = await this.executeOTPWorkflow(workflow, form, formStructure);
          break;
        case 'multi_step_registration':
          result = await this.executeRegistrationWorkflow(workflow, form, formStructure);
          break;
        case 'payment_flow':
          result = await this.executePaymentWorkflow(workflow, form, formStructure);
          break;
        case 'login_flow':
          result = await this.executeLoginWorkflow(workflow, form, formStructure);
          break;
        default:
          result = await this.executeGenericWorkflow(workflow, form, formStructure);
      }

      // Finalize workflow
      workflow.endTime = Date.now();
      workflow.duration = workflow.endTime - workflow.startTime;
      workflow.status = result.success ? 'completed' : 'failed';
      
      this.completedWorkflows.push(workflow);
      this.activeWorkflows.delete(workflowId);

      this.emit('workflowCompleted', workflow);
      
      this.logger.info(`✅ Workflow ${workflowId} completed: ${workflow.status}`);
      
      return workflow;

    } catch (error) {
      this.logger.error('Workflow execution failed:', error);
      return null;
    }
  }

  generateWorkflowId(fingerprint) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const hash = fingerprint.substring(0, 8);
    return `wf_${timestamp}_${hash}_${random}`;
  }

  detectWorkflowType(formStructure) {
    const inputs = formStructure.inputs || [];
    const fieldNames = inputs.map(input => (input.name || '').toLowerCase());
    const fieldTypes = inputs.map(input => input.type);

    // OTP Flow Detection
    if (fieldNames.some(name => name.includes('otp') || name.includes('verification'))) {
      return 'otp_flow';
    }

    // Payment Flow Detection
    if (fieldNames.some(name => 
      name.includes('card') || name.includes('payment') || 
      name.includes('amount') || name.includes('cvv')
    )) {
      return 'payment_flow';
    }

    // Registration Flow Detection
    if (fieldNames.some(name => 
      name.includes('password') && name.includes('confirm')
    ) || fieldNames.length > 6) {
      return 'multi_step_registration';
    }

    // Login Flow Detection
    if (fieldNames.some(name => name.includes('password')) && 
        fieldNames.some(name => name.includes('email') || name.includes('username'))) {
      return 'login_flow';
    }

    return 'generic';
  }

  async executeOTPWorkflow(workflow, form, formStructure) {
    try {
      this.logger.info('📱 Executing OTP workflow...');
      
      const steps = [
        { name: 'fill_mobile', action: 'fill_phone_number' },
        { name: 'request_otp', action: 'click_get_otp' },
        { name: 'wait_otp', action: 'wait_for_otp_field' },
        { name: 'enter_otp', action: 'fill_otp' },
        { name: 'verify_otp', action: 'submit_otp' }
      ];

      workflow.totalSteps = steps.length;

      for (const [index, step] of steps.entries()) {
        workflow.currentStep = index + 1;
        this.logger.debug(`Step ${workflow.currentStep}: ${step.name}`);

        const stepResult = await this.executeWorkflowStep(workflow, step, form);
        
        workflow.steps.push({
          stepNumber: workflow.currentStep,
          stepName: step.name,
          action: step.action,
          success: stepResult.success,
          duration: stepResult.duration,
          timestamp: Date.now()
        });

        if (!stepResult.success) {
          this.logger.warn(`Step ${step.name} failed: ${stepResult.error}`);
          if (step.name === 'request_otp') {
            // OTP request failed, but continue anyway
            continue;
          } else {
            return { success: false, error: stepResult.error };
          }
        }

        // Wait between steps
        if (index < steps.length - 1) {
          await workflow.page.waitForTimeout(this.stepDelay);
        }

        // Stop if max steps reached
        if (workflow.currentStep >= this.maxSteps) {
          break;
        }
      }

      return { success: true };

    } catch (error) {
      this.logger.error('OTP workflow failed:', error);
      return { success: false, error: error.message };
    }
  }

  async executeRegistrationWorkflow(workflow, form, formStructure) {
    try {
      this.logger.info('📝 Executing registration workflow...');

      const steps = [
        { name: 'fill_personal_info', action: 'fill_basic_fields' },
        { name: 'fill_contact_info', action: 'fill_contact_fields' },
        { name: 'fill_credentials', action: 'fill_password_fields' },
        { name: 'accept_terms', action: 'check_agreements' },
        { name: 'submit_registration', action: 'submit_form' }
      ];

      workflow.totalSteps = steps.length;

      for (const [index, step] of steps.entries()) {
        workflow.currentStep = index + 1;
        
        const stepResult = await this.executeWorkflowStep(workflow, step, form);
        
        workflow.steps.push({
          stepNumber: workflow.currentStep,
          stepName: step.name,
          action: step.action,
          success: stepResult.success,
          duration: stepResult.duration,
          timestamp: Date.now()
        });

        if (!stepResult.success && step.name !== 'accept_terms') {
          return { success: false, error: stepResult.error };
        }

        await workflow.page.waitForTimeout(this.stepDelay);

        if (workflow.currentStep >= this.maxSteps) {
          break;
        }
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executePaymentWorkflow(workflow, form, formStructure) {
    try {
      this.logger.info('💳 Executing payment workflow...');

      const steps = [
        { name: 'fill_amount', action: 'enter_amount' },
        { name: 'select_payment_method', action: 'choose_payment' },
        { name: 'fill_card_details', action: 'enter_card_info' },
        { name: 'confirm_payment', action: 'confirm_transaction' }
      ];

      workflow.totalSteps = steps.length;

      for (const [index, step] of steps.entries()) {
        workflow.currentStep = index + 1;
        
        const stepResult = await this.executeWorkflowStep(workflow, step, form);
        
        workflow.steps.push({
          stepNumber: workflow.currentStep,
          stepName: step.name,
          action: step.action,
          success: stepResult.success,
          duration: stepResult.duration,
          timestamp: Date.now()
        });

        // Stop before actual payment submission for safety
        if (step.name === 'confirm_payment' && this.config.get('submitForms')) {
          this.logger.warn('⚠️ Stopping before payment submission for safety');
          break;
        }

        if (!stepResult.success) {
          return { success: false, error: stepResult.error };
        }

        await workflow.page.waitForTimeout(this.stepDelay);

        if (workflow.currentStep >= this.maxSteps) {
          break;
        }
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeLoginWorkflow(workflow, form, formStructure) {
    try {
      this.logger.info('🔐 Executing login workflow...');

      const steps = [
        { name: 'fill_username', action: 'enter_username' },
        { name: 'fill_password', action: 'enter_password' },
        { name: 'handle_captcha', action: 'solve_captcha' },
        { name: 'submit_login', action: 'click_login' }
      ];

      workflow.totalSteps = steps.length;

      for (const [index, step] of steps.entries()) {
        workflow.currentStep = index + 1;
        
        const stepResult = await this.executeWorkflowStep(workflow, step, form);
        
        workflow.steps.push({
          stepNumber: workflow.currentStep,
          stepName: step.name,
          action: step.action,
          success: stepResult.success,
          duration: stepResult.duration,
          timestamp: Date.now()
        });

        // CAPTCHA step is optional
        if (!stepResult.success && step.name !== 'handle_captcha') {
          return { success: false, error: stepResult.error };
        }

        await workflow.page.waitForTimeout(this.stepDelay);

        if (workflow.currentStep >= this.maxSteps) {
          break;
        }
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeGenericWorkflow(workflow, form, formStructure) {
    try {
      this.logger.info('🔄 Executing generic workflow...');

      const steps = [
        { name: 'fill_form', action: 'fill_all_fields' },
        { name: 'validate_form', action: 'check_validation' },
        { name: 'submit_form', action: 'submit_if_enabled' }
      ];

      workflow.totalSteps = steps.length;

      for (const [index, step] of steps.entries()) {
        workflow.currentStep = index + 1;
        
        const stepResult = await this.executeWorkflowStep(workflow, step, form);
        
        workflow.steps.push({
          stepNumber: workflow.currentStep,
          stepName: step.name,
          action: step.action,
          success: stepResult.success,
          duration: stepResult.duration,
          timestamp: Date.now()
        });

        if (!stepResult.success && step.name === 'fill_form') {
          return { success: false, error: stepResult.error };
        }

        await workflow.page.waitForTimeout(this.stepDelay);

        if (workflow.currentStep >= this.maxSteps) {
          break;
        }
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async executeWorkflowStep(workflow, step, form) {
    const startTime = Date.now();
    
    try {
      let result;
      switch (step.action) {
        case 'fill_phone_number':
          result = await this.fillPhoneNumber(form);
          break;
        case 'click_get_otp':
          result = await this.clickGetOTP(form);
          break;
        case 'wait_for_otp_field':
          result = await this.waitForOTPField(workflow.page);
          break;
        case 'fill_otp':
          result = await this.fillOTP(form);
          break;
        case 'submit_otp':
          result = await this.submitOTP(form);
          break;
        case 'fill_basic_fields':
          result = await this.fillBasicFields(form);
          break;
        case 'fill_contact_fields':
          result = await this.fillContactFields(form);
          break;
        case 'fill_password_fields':
          result = await this.fillPasswordFields(form);
          break;
        case 'check_agreements':
          result = await this.checkAgreements(form);
          break;
        case 'submit_form':
          result = await this.submitForm(form, workflow.page);
          break;
        default:
          result = { success: true, message: 'Step skipped' };
      }
      
      const duration = Date.now() - startTime;
      return { ...result, duration };
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  async fillPhoneNumber(form) {
    const phoneSelectors = ['[name*="phone"]', '[name*="mobile"]', '[type="tel"]'];
    
    for (const selector of phoneSelectors) {
      try {
        const field = form.locator(selector).first();
        const isVisible = await field.isVisible().catch(() => false);
        
        if (isVisible) {
          await field.fill('9876543210');
          return { success: true };
        }
      } catch (error) {
        continue;
      }
    }
    
    return { success: false, error: 'Phone field not found' };
  }

  async clickGetOTP(form) {
    const otpButtonSelectors = [
      'button:has-text("OTP")', 'button:has-text("Get OTP")',
      'button:has-text("Send OTP")', '[data-action*="otp"]',
      '.get-otp', '.send-otp'
    ];

    for (const selector of otpButtonSelectors) {
      try {
        const button = form.locator(selector).first();
        const isVisible = await button.isVisible().catch(() => false);
        
        if (isVisible) {
          await button.click();
          return { success: true };
        }
      } catch (error) {
        continue;
      }
    }

    return { success: false, error: 'Get OTP button not found' };
  }

  async waitForOTPField(page) {
    try {
      await page.waitForSelector('[name*="otp"], [placeholder*="OTP"]', { timeout: 10000 });
      return { success: true };
    } catch (error) {
      return { success: false, error: 'OTP field did not appear' };
    }
  }

  async fillOTP(form) {
    const otpSelectors = ['[name*="otp"]', '[placeholder*="OTP"]', '.otp-input'];
    
    for (const selector of otpSelectors) {
      try {
        const field = form.locator(selector).first();
        const isVisible = await field.isVisible().catch(() => false);
        
        if (isVisible) {
          await field.fill('123456');
          return { success: true };
        }
      } catch (error) {
        continue;
      }
    }
    
    return { success: false, error: 'OTP field not found' };
  }

  async submitOTP(form) {
    const submitSelectors = [
      'button:has-text("Verify")', 'button:has-text("Submit")',
      'button[type="submit"]', '.verify-otp'
    ];

    for (const selector of submitSelectors) {
      try {
        const button = form.locator(selector).first();
        const isVisible = await button.isVisible().catch(() => false);
        
        if (isVisible && this.config.get('submitForms')) {
          await button.click();
          return { success: true };
        }
      } catch (error) {
        continue;
      }
    }

    return { success: true, message: 'OTP submit skipped' };
  }

  async fillBasicFields(form) {
    const basicFields = {
      '[name*="name"]': 'John Doe',
      '[name*="email"]': 'test@example.com',
      '[name*="age"]': '25'
    };

    let filled = 0;
    for (const [selector, value] of Object.entries(basicFields)) {
      try {
        const field = form.locator(selector).first();
        const isVisible = await field.isVisible().catch(() => false);
        
        if (isVisible) {
          await field.fill(value);
          filled++;
        }
      } catch (error) {
        continue;
      }
    }

    return { success: filled > 0, message: `Filled ${filled} basic fields` };
  }

  async fillContactFields(form) {
    const contactFields = {
      '[name*="phone"]': '9876543210',
      '[name*="address"]': '123 Test Street',
      '[name*="city"]': 'Mumbai'
    };

    let filled = 0;
    for (const [selector, value] of Object.entries(contactFields)) {
      try {
        const field = form.locator(selector).first();
        const isVisible = await field.isVisible().catch(() => false);
        
        if (isVisible) {
          await field.fill(value);
          filled++;
        }
      } catch (error) {
        continue;
      }
    }

    return { success: filled > 0, message: `Filled ${filled} contact fields` };
  }

  async fillPasswordFields(form) {
    const passwordFields = form.locator('[type="password"]');
    const count = await passwordFields.count();
    
    for (let i = 0; i < count; i++) {
      try {
        const field = passwordFields.nth(i);
        await field.fill('SecurePass123!');
      } catch (error) {
        continue;
      }
    }

    return { success: count > 0, message: `Filled ${count} password fields` };
  }

  async checkAgreements(form) {
    const checkboxes = form.locator('[type="checkbox"]');
    const count = await checkboxes.count();
    let checked = 0;

    for (let i = 0; i < count; i++) {
      try {
        const checkbox = checkboxes.nth(i);
        const isVisible = await checkbox.isVisible().catch(() => false);
        
        if (isVisible) {
          await checkbox.check();
          checked++;
        }
      } catch (error) {
        continue;
      }
    }

    return { success: checked > 0, message: `Checked ${checked} agreements` };
  }

  async submitForm(form, page) {
    if (!this.config.get('submitForms')) {
      return { success: true, message: 'Form submission disabled' };
    }

    try {
      const submitButton = form.locator('button[type="submit"], input[type="submit"]').first();
      const isVisible = await submitButton.isVisible().catch(() => false);
      
      if (isVisible) {
        await submitButton.click();
        
        // Wait for potential navigation
        try {
          await page.waitForNavigation({ timeout: 5000 });
        } catch {
          // No navigation occurred
        }
        
        return { success: true };
      } else {
        // Try form submit
        await form.evaluate(f => f.submit());
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getActiveWorkflows() {
    return Array.from(this.activeWorkflows.values());
  }

  getCompletedWorkflows() {
    return this.completedWorkflows;
  }

  getStats() {
    return {
      activeWorkflows: this.activeWorkflows.size,
      completedWorkflows: this.completedWorkflows.length,
      maxSteps: this.maxSteps,
      stepDelay: this.stepDelay
    };
  }
}

module.exports = { WorkflowManager };
