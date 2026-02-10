// src/core/QueueManager.js
class QueueManager {
  constructor(logger) {
    this.logger = logger;
    this.queue = [];
    this.visited = new Set();
    this.failed = new Set();
    this.enqueued = new Set();
  }

  add(url, depth, referer) {
    if (this.visited.has(url) || this.enqueued.has(url)) {
      return false;
    }
    this.enqueued.add(url);
    this.queue.push({ url, depth, referer });
    return true;
  }

  getNext() {
    if (this.queue.length === 0) {
      return null;
    }
    this.queue.sort((a, b) => a.depth - b.depth);
    const item = this.queue.shift();
    if (item) {
      this.enqueued.delete(item.url);
      if (this.visited.has(item.url) || this.failed.has(item.url)) {
        return this.getNext();
      }
      this.visited.add(item.url);
    }
    return item;
  }

  addVisited(url) {
    this.visited.add(url);
  }

  hasVisited(url) {
    return this.visited.has(url);
  }

  addFailed(url) {
    this.failed.add(url);
  }

  hasFailed(url) {
    return this.failed.has(url);
  }

  getQueueSize() {
    return this.queue.length;
  }

  getVisitedSize() {
    return this.visited.size;
  }
}

module.exports = { QueueManager };
