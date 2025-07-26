// Remove mongoose and export a simple in-memory object
module.exports = {
  profiles: {},
  findOne: async function(query = {}) {
    // Mock findOne function
    const userId = query.userId || 'demo-user';
    return this.profiles[userId] || null;
  },
  findOneAndUpdate: async function(query, update, options = {}) {
    // Mock findOneAndUpdate function
    const userId = query.userId || 'demo-user';
    if (!this.profiles[userId]) {
      this.profiles[userId] = {};
    }
    this.profiles[userId] = { ...this.profiles[userId], ...update };
    return this.profiles[userId];
  },
  create: async function(data) {
    // Mock create function
    const userId = data.userId || 'demo-user';
    this.profiles[userId] = data;
    return this.profiles[userId];
  }
}; 