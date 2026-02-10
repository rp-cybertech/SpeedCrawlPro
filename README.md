# 🚀 SpeedCrawl Pro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Latest-45ba4b)](https://playwright.dev/)

> **An automated security-aware crawler for modern web applications that discovers routes, fills and submits forms, captures runtime API endpoints, detects secrets, and generates multiple output formats for security testing.**

[Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [Usage Examples](#-usage-examples) • [Output Formats](#-output-formats) • [CLI Options](#-cli-options) • [Troubleshooting](#-troubleshooting)

---

## 🎯 Overview

SpeedCrawl Pro is a powerful, Playwright-based web crawler designed for security testing and web reconnaissance. It automatically discovers routes, processes forms, captures network requests, detects secrets, and generates multiple output formats optimized for security workflows.

### Perfect For

- 🔒 **Penetration Testers & Security Researchers** - Comprehensive application mapping
- 🐛 **Bug Bounty Hunters** - Fast reconnaissance and endpoint discovery  
- 🤖 **Automated Security Pipelines** - CI/CD integration ready
- 📊 **API Discovery & Mapping** - Runtime endpoint extraction
- 🔍 **Secret Scanning** - Detect exposed credentials and API keys
- 🎯 **Form Testing** - Automatic form submission and validation

---

## ✨ Features

### 🎯 **Intelligent Form Processing**
- **Automatic multi-form discovery and submission** (single flag needed)
- Native property descriptors for React Hook Form compatibility
- Smart checkbox, radio button, and select handling
- Faker.js integration for realistic test data
- SPA form detection and handling

### 🔍 **Network & Endpoint Discovery**
- Real-time network request capture
- API endpoint extraction from network traffic
- WebSocket monitoring capabilities
- Request/response header and payload recording

### 📦 **JavaScript Analysis**
- AST-based JavaScript chunk analysis (70+ patterns)
- Hidden endpoint extraction from minified code
- Technology and framework detection
- Configuration file discovery

### 🕵️ **Stealth Browser Control**
- Anti-detection with user agent spoofing
- Headful/headless modes
- HTTP/HTTPS/SOCKS proxy support
- Custom headers and cookie management

### 📊 **Multiple Output Formats**
- **JSON** - Complete structured results
- **JSONL** - Request logs for analysis
- **HAR** - HTTP Archive for request replay
- **HTTP** - Raw request files for manual testing

### 🔐 **Advanced Security Features**
- Pattern-based secret detection (20+ patterns)
- Improved false positive filtering
- API key, token, and credential extraction
- Entropy-based detection algorithms

### 🌐 **Smart Crawling Control**
- Same-origin policy enforcement
- Subdomain inclusion with wildcard support
- File extension blocking
- Custom URL filtering
- Request delay and throttling

### 📈 **Real-time Progress & Debugging**
- Live CLI progress with detailed statistics
- Multi-level verbosity (0-4)
- Debug mode with comprehensive logging
- Request/response tracking

---

## 📋 Prerequisites

| Requirement | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18+ (20+ recommended) | Runtime environment |
| **Git** | Latest | Repository cloning |
| **Terminal** | Linux/macOS/WSL | Command execution |

> **Note**: Chromium browser installed automatically via Playwright

### Installing Node.js with NVM

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart terminal and install Node.js 20
source ~/.bashrc 2>/dev/null || source ~/.zshrc 2>/dev/null
nvm install 20
nvm use 20
```

---

## 🔧 Installation

### Quick Install (Recommended)

```bash
# Clone the repository
git clone https://github.com/rp-cybertech/SpeedCrawlPro.git
cd SpeedCrawlPro

# Install dependencies
npm install

# Install Playwright browsers
npm run install-browsers
```

### Verify Installation

```bash
# Test help command
node bin/speedcrawl.js --help

# Run a quick test
npm run test
```

---

## 🚀 Quick Start

### Basic Usage

```bash
# Minimal crawl with default settings
npx speedcrawl -u https://example.com

# Crawl with specific limits
npx speedcrawl -u https://example.com --pages 50 --depth 3

# Generate all output formats
npx speedcrawl -u https://example.com --formats json,jsonl,har,http
```

### Form Testing (Multi-form Automatic)

```bash
# Form submission with fake data (multi-form automatic)
npx speedcrawl -u https://app.example.com/login \
  --submit-forms \
  --use-faker \
  --formats json,har

# Custom form data
echo '{"email":"test@example.com","password":"test123"}' > input.json
npx speedcrawl -u https://app.example.com/signup \
  --submit-forms \
  -i input.json
```

### Security-Focused Scanning

```bash
# Comprehensive security scan
npx speedcrawl -u https://example.com \
  --extract-secrets \
  --deep-js-analysis \
  --submit-forms \
  --formats json,jsonl,har,http

# With proxy for testing
npx speedcrawl -u https://example.com \
  --proxy http://proxy:8080 \
  --submit-forms \
  --extract-secrets
```

---

## 📖 Usage Examples

### 1. Bug Bounty Reconnaissance

```bash
# Fast reconnaissance scan
npx speedcrawl -u https://target.com \
  --pages 100 \
  --depth 5 \
  --include-subdomains "*.target.com" \
  --deep-js-analysis \
  --extract-secrets \
  --submit-forms \
  --use-faker \
  --formats json,jsonl,har,http \
  --request-delay 500
```

### 2. Nuclei Integration

```bash
# Generate JSONL for nuclei scanning
npx speedcrawl -u https://target.com \
  --formats jsonl \
  -j nuclei-targets.jsonl \
  --extract-secrets \
  --pages 50
npx speedcrawl -u http://testphp.vulnweb.com/   --formats jsonl   -j nuclei-targets.jsonl   --extract-secrets   --pages 50 -d 10 --threads 30 -v 2  --submit-forms --same-origin

nuclei -l nuclei-targets.jsonl -im jsonl -t  ~/nuclei-templates/dast/
<img width="1914" height="778" alt="image" src="https://github.com/user-attachments/assets/8bf720f4-cd87-4b1d-b15c-2725a0cdb76c" />

# Run nuclei on generated targets
nuclei -l nuclei-targets.jsonl -im jsonl -t ~/nuclei-templates/


```


```

### 3. Dalfox Integration (XSS Testing)

```bash
# Generate URLs for Dalfox
npx speedcrawl -u http://testphp.vulnweb.com/   --formats har    --har file.har    --extract-secrets   --pages 50 --threads 30 -v 2  --submit-forms --same-origin



# Run Dalfox on discovered URLs
dalfox file  file.har  --har  -o xss-results.txt

<img width="1866" height="347" alt="image" src="https://github.com/user-attachments/assets/2d1ce2d5-3828-4999-9099-5dbbd4a4bacd" />

```

### 4. Corporate Network Testing

```bash
# Behind corporate proxy
npx speedcrawl -u https://internal.company.com \
  --proxy http://user:pass@proxy.company.com:8080 \
  --no-ssl-check \
  --formats json,http \
  --submit-forms
```

### 5. Debug & Development Mode

```bash
# Full debug output
npx speedcrawl -u https://example.com \
  --debug \
  -v 3 \
  --headful \
  --pages 5 \
  --submit-forms
```

---

## 🎛️ CLI Options Reference

### Core Options

| Flag | Description | Default |
|------|-------------|---------|
| `-u, --url <url>` | Target URL to crawl | **Required** |
| `-p, --pages <n>` | Maximum pages to crawl | `100` |
| `-d, --depth <n>` | Maximum crawl depth | `5` |
| `-o, --output <dir>` | Output directory | `./speedcrawl-output` |
| `-v, --verbose <n>` | Verbosity level (0-4) | `1` |
| `--formats <list>` | Output formats | `json` |

**Format Options**: `json`, `jsonl`, `har`, `http`

### Form & Input Options

| Flag | Description | Default |
|------|-------------|---------|
| `--submit-forms` | Enable automatic form submission | `false` |
| `--use-faker` | Use Faker.js for realistic data | `true` |
| `-i, --input <file>` | Custom input data JSON file | - |
| `--form-delay <ms>` | Delay before filling forms | `1000` |
| `--prioritize-forms` | Prioritize crawling form pages | `false` |

### Analysis & Security Options

| Flag | Description | Default |
|------|-------------|---------|
| `--deep-js-analysis` | Enable JavaScript AST parsing | `false` |
| `--extract-secrets` | Scan for secrets and API keys | `true` |
| `-j, --jsonl <file>` | Custom JSONL output file path (for nuclei) | - |
| `--har <file>` | Custom HAR output file path (for Burp Suite) | - |
| `--json <file>` | Custom JSON output file path | - |

### Scope & Filtering

| Flag | Description | Default |
|------|-------------|---------|
| `--same-origin` | Only crawl same-origin URLs | `false` |
| `--include-subdomains <pattern>` | Include subdomains (e.g., `*.example.com`) | - |
| `--blocked-extensions <exts>` | Block file extensions (comma-separated) | - |
| `--js-exclude-extensions <exts>` | Skip in JS analysis | - |

### Browser & Network Options

| Flag | Description | Default |
|------|-------------|---------|
| `--headful` | Show browser window | `false` |
| `--user-agent <ua>` | Custom User-Agent | Playwright default |
| `--proxy <url>` | HTTP/HTTPS/SOCKS proxy URL | - |
| `--ssl-check` | Verify SSL certificates | `true` |
| `--no-ssl-check` | Ignore SSL certificate errors | - |
| `--request-delay <ms>` | Delay between requests | `1000` |
| `--timeout <ms>` | Page load timeout | `30000` |
| `--network-idle` | Wait for network idle | `false` |

### Advanced Options

| Flag | Description | Default |
|------|-------------|---------|
| `--threads <n>` | Concurrent pages | `1` |
| `--evasion-mode` | Enable bot evasion techniques | `false` |
| `--auto-resume` | Resume from previous state | `false` |
| `--debug` | Enable debug logging | `false` |

---

## 📊 Output Formats

SpeedCrawl Pro generates comprehensive outputs in the target domain directory:

### Main Output Files

| File | Description | Use Case |
|------|-------------|----------|
| `summary.json` | JSON summary with statistics | Quick overview, automation |
| `summary.md` | Human-readable markdown report | Documentation, sharing |
| `all-urls.txt` | All discovered URLs | Sitemap generation |
| `endpoints.txt` | Discovered API endpoints | API testing |
| `secrets.txt` | Detected secrets | Security review |
| `technologies.txt` | Detected technologies | Tech stack analysis |

### Format-Specific Outputs

| Format | Location | Description |
|--------|-----------|-------------|
| **JSON** | `speedcrawl-results.json` | Complete structured data |
| **JSONL** | `jsonl/requests.jsonl` | Request logs (293+ entries typical) |
| **HAR** | `har/requests.har` | HTTP Archive for replay |
| **HTTP** | `http-requests/` | Raw HTTP request files |

### Sample Output Structure

```
speedcrawl-output/
├── target-domain/
│   ├── speedcrawl-results.json      # Main results
│   ├── jsonl/
│   │   └── requests.jsonl          # Request logs
│   ├── har/
│   │   └── requests.har            # HTTP Archive
│   ├── http-requests/
│   │   └── requests.http           # Raw requests
│   ├── summary.json                 # Statistics
│   ├── summary.md                   # Markdown report
│   ├── all-urls.txt               # All URLs found
│   ├── endpoints.txt              # API endpoints
│   ├── secrets.txt                # Secrets detected
│   └── technologies.txt          # Technologies found
```

### Typical Crawl Results

Based on testing:
- **Pages Crawled**: 2-100 (configurable)
- **HTTP Requests**: 15-293 per crawl
- **Forms Found**: 0-2 per page
- **Secrets Detected**: 0 (with improved filtering)
- **Technologies**: 0-5 per site
- **Duration**: 5-38 seconds per crawl

---

## 🔧 Configuration

### Environment Variables

Create `.env` file in project root:

```env
# Proxy configuration
PROXY_URL=http://proxy:8080

# Custom user agent
USER_AGENT=CustomCrawler/1.0

# Output settings
OUTPUT_DIR=./custom-output

# Request settings
REQUEST_DELAY=2000
TIMEOUT=60000
```

### Custom Input Data

Create `input.json` for form testing:

```json
{
  "username": "testuser",
  "email": "test@example.com", 
  "password": "SecureP@ss123",
  "phone": "+1234567890",
  "address": "123 Test Street"
}
```

---

## 🛠️ Development & Integration

### NPM Scripts

```bash
npm run start          # Run with default URL
npm run test           # Quick test scan
npm run test-forms     # Form testing demo
npm run test-secrets   # Secret detection demo
npm run install-browsers # Install Playwright
```

### CI/CD Integration

```bash
# Automated security scanning
npx speedcrawl -u $TARGET_URL \
  --pages 50 \
  --extract-secrets \
  --submit-forms \
  --formats jsonl \
  --timeout 60000 \
  -v 1
```


---

## 🐛 Troubleshooting

### Common Issues & Solutions

#### ❌ Browser Not Found
```bash
# Install Playwright browsers
npm run install-browsers
npx playwright install chromium
```

#### ❌ SSL Certificate Errors
```bash
# Disable SSL verification
npx speedcrawl -u https://target.com --no-ssl-check
```

#### ❌ No Forms Found
```bash
# Check if forms exist with verbose output
npx speedcrawl -u https://target.com --submit-forms -v 3
```

#### ❌ No Secrets Detected
- This is normal - false positive filtering is strict
- Use debug mode to see what's being scanned:
```bash
npx speedcrawl -u https://target.com --extract-secrets --debug -v 3
```

#### ❌ Performance Issues
```bash
# Optimize for speed
npx speedcrawl -u https://target.com \
  --pages 20 \
  --blocked-extensions "jpg,png,gif,css,woff" \
  --request-delay 200
```

### Debug Mode

For comprehensive troubleshooting:

```bash
npx speedcrawl -u https://target.com \
  --debug \
  -v 3 \
  --headful \
  --pages 5
```

This provides:
- Full debug logging
- Maximum verbosity
- Visible browser window
- Limited scope for fast iteration

---

## 🤝 Contributing

Contributions welcome! Please follow these steps:

1. **Fork the repository**
2. **Create feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make changes** with proper testing
4. **Commit changes** (`git commit -m 'Add amazing feature'`)
5. **Push to branch** (`git push origin feature/amazing-feature`)
6. **Open Pull Request**

### Development Guidelines

- ✅ Test with `npm run test` before submitting
- ✅ Follow existing code style
- ✅ Document new features in README
- ✅ Maintain backward compatibility

---

## 📄 License

SpeedCrawl Pro is licensed under the MIT License.

---

## 🔗 Resources

- **GitHub Repository**: [github.com/rp-cybertech/SpeedCrawlPro](https://github.com/rp-cybertech/SpeedCrawlPro)
- **Issues & Support**: [GitHub Issues](https://github.com/rp-cybertech/SpeedCrawlPro/issues)
- **Playwright Documentation**: [playwright.dev](https://playwright.dev/)
- **Node.js**: [nodejs.org](https://nodejs.org/)

---

## 📞 Support

For issues and questions:

1. **Check troubleshooting section** first
2. **Search existing issues** on GitHub
3. **Create new issue** with:
   - Node.js version (`node -v`)
   - Operating system
   - Command used
   - Error messages
   - Debug output (`--debug -v 3`)

---

<div align="center">

**Built with ❤️ by rp-cybertech**

[⬆ Back to Top](#-speedcrawl-pro)

</div>
