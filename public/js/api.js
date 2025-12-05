// API Helper Class
class API {
  constructor() {
    this.baseURL = '/api';
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getHeaders(),
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Bir hata oluştu');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  // GET request
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  // POST request
  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // PUT request
  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  // DELETE request
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Auth endpoints
  login(email, password) {
    return this.post('/auth/login', { email, password });
  }

  getProfile() {
    return this.get('/auth/profile');
  }

  getUsers() {
    return this.get('/auth/users');
  }

  createUser(data) {
    return this.post('/auth/users', data);
  }

  deleteUser(id) {
    return this.delete(`/auth/users/${id}`);
  }

  // Domain endpoints
  getDomains() {
    return this.get('/domains');
  }

  createDomain(data) {
    return this.post('/domains', data);
  }

  deleteDomain(id) {
    return this.delete(`/domains/${id}`);
  }

  verifyDomain(id) {
    return this.post(`/domains/${id}/verify`);
  }

  setupSSL(id) {
    return this.post(`/domains/${id}/ssl`);
  }

  // Mail endpoints
  getMailAccounts() {
    return this.get('/mail');
  }

  createMailAccount(data) {
    return this.post('/mail', data);
  }

  deleteMailAccount(id) {
    return this.delete(`/mail/${id}`);
  }

  // Apps endpoints
  getApps() {
    return this.get('/apps');
  }

  getInstalledApps() {
    return this.get('/apps/installed/list');
  }

  installApp(appId, data) {
    return this.post(`/apps/${appId}/install`, data);
  }

  uninstallApp(id) {
    return this.delete(`/apps/installed/${id}`);
  }

  startApp(id) {
    return this.post(`/apps/installed/${id}/start`);
  }

  stopApp(id) {
    return this.post(`/apps/installed/${id}/stop`);
  }

  restartApp(id) {
    return this.post(`/apps/installed/${id}/restart`);
  }

  seedApps() {
    return this.post('/apps/seed');
  }

  // Docker endpoints
  getContainers() {
    return this.get('/docker/containers');
  }

  getImages() {
    return this.get('/docker/images');
  }

  getNetworks() {
    return this.get('/docker/networks');
  }

  getVolumes() {
    return this.get('/docker/volumes');
  }

  startContainer(id) {
    return this.post(`/docker/containers/${id}/start`);
  }

  stopContainer(id) {
    return this.post(`/docker/containers/${id}/stop`);
  }

  restartContainer(id) {
    return this.post(`/docker/containers/${id}/restart`);
  }

  deleteContainer(id) {
    return this.delete(`/docker/containers/${id}`);
  }

  pullImage(image) {
    return this.post('/docker/images/pull', { image });
  }

  // System endpoints
  getSystemInfo() {
    return this.get('/system/info');
  }

  getCPU() {
    return this.get('/system/cpu');
  }

  getMemory() {
    return this.get('/system/memory');
  }

  getDisk() {
    return this.get('/system/disk');
  }

  getServices() {
    return this.get('/system/services');
  }

  controlService(service, action) {
    return this.post(`/system/services/${service}/${action}`);
  }

  getLogs(type, lines = 100) {
    return this.get(`/system/logs/${type}?lines=${lines}`);
  }

  updateSystem() {
    return this.post('/system/update');
  }

  reloadNginx() {
    return this.post('/system/nginx/reload');
  }

  renewSSL() {
    return this.post('/system/ssl/renew');
  }

  reboot() {
    return this.post('/system/reboot');
  }
}

// Global API instance
window.api = new API();
