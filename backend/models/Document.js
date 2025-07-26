// Remove mongoose and export a simple in-memory object
module.exports = {
  documents: [],
  aggregate: async function() {
    // Mock aggregate function
    return [];
  },
  countDocuments: async function(query = {}) {
    // Mock count function
    return this.documents.length;
  },
  find: async function(query = {}) {
    // Mock find function
    return this.documents;
  },
  updateMany: async function(filter, update) {
    // Mock updateMany function
    return { modifiedCount: 0 };
  }
}; 