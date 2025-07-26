// Remove mongoose and export a simple in-memory object
module.exports = {
  jobs: [],
  find: async function(query = {}) {
    // Mock find function
    return this.jobs;
  },
  findById: async function(id) {
    // Mock findById function
    return this.jobs.find(job => job.id === id);
  },
  create: async function(data) {
    // Mock create function
    const newJob = { id: Date.now().toString(), ...data };
    this.jobs.push(newJob);
    return newJob;
  },
  findByIdAndUpdate: async function(id, update, options = {}) {
    // Mock findByIdAndUpdate function
    const jobIndex = this.jobs.findIndex(job => job.id === id);
    if (jobIndex !== -1) {
      this.jobs[jobIndex] = { ...this.jobs[jobIndex], ...update };
      return this.jobs[jobIndex];
    }
    return null;
  },
  findByIdAndDelete: async function(id) {
    // Mock findByIdAndDelete function
    const jobIndex = this.jobs.findIndex(job => job.id === id);
    if (jobIndex !== -1) {
      const deletedJob = this.jobs.splice(jobIndex, 1)[0];
      return deletedJob;
    }
    return null;
  }
}; 