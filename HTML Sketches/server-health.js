/**
 * Server Health Monitoring
 * Monitors the Express server connection and notifies on disconnection/reconnection
 */

const SERVER_HEALTH_CHECK_INTERVAL = 5000; // 5 seconds
let healthCheckInterval = null;
let isServerHealthy = true;

async function checkServerHealth() {
  try {
    const response = await fetch('http://localhost:3000/health', {
      method: 'GET',
      cache: 'no-cache'
    });

    if (response.ok) {
      if (!isServerHealthy) {
        console.log('Server connection restored');
        isServerHealthy = true;
        // Trigger UI update - server is back
        window.dispatchEvent(new CustomEvent('server-reconnected'));
      }
      return true;
    }
  } catch (error) {
    if (isServerHealthy) {
      console.error('Server connection lost');
      isServerHealthy = false;
      // Trigger UI update - server is down
      window.dispatchEvent(new CustomEvent('server-disconnected'));
    }
    return false;
  }
}

function startHealthCheck() {
  if (healthCheckInterval) return;

  healthCheckInterval = setInterval(checkServerHealth, SERVER_HEALTH_CHECK_INTERVAL);
  checkServerHealth(); // Check immediately
}

function stopHealthCheck() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Auto-start when page loads
if (typeof window !== 'undefined') {
  window.addEventListener('load', startHealthCheck);
  window.addEventListener('unload', stopHealthCheck);

  // Expose globally
  window.ServerHealth = {
    check: checkServerHealth,
    isHealthy: () => isServerHealthy,
    start: startHealthCheck,
    stop: stopHealthCheck
  };
}
