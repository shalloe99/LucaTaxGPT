'use client';

import { useState, useEffect } from 'react';

interface CrawlerJob {
  jobId: string;
  websiteUrl: string;
  stage: 'discovery' | 'preparation' | 'selection' | 'completed' | 'error';
  progress: number;
  status: 'running' | 'paused' | 'completed' | 'error';
  discoveryResults?: {
    resources: Resource[];
    dependencyTree: any;
    totalResources: number;
  };
  preparationResults?: {
    downloadableResources: PreparedResource[];
    totalDownloadable: number;
  };
  selectionResults?: {
    selectedResources: any[];
    totalSelected: number;
    downloadedCount: number;
    processedCount: number;
    embeddedCount: number;
  };
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // Summary counts for display
  discoveryCount?: number;
  preparationCount?: number;
  selectionCount?: number;
  downloadedCount?: number;
  processedCount?: number;
  embeddedCount?: number;
}

interface Resource {
  id: string;
  url: string;
  title: string;
  description: string;
  importance: number;
  type: 'pdf' | 'html' | 'other';
  dependencies: string[];
}

interface PreparedResource {
  id: string;
  url: string;
  title: string;
  description: string;
  originalUrl: string;
  name: string;
  fileType: string;
  fileSize: number;
  metadata: {
    contentType?: string;
    lastModified?: string;
    etag?: string;
  };
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'overview' | 'crawler' | 'jobs' | 'storage'>('overview');
  const [crawlerUrl, setCrawlerUrl] = useState('');
  const [jobs, setJobs] = useState<CrawlerJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<CrawlerJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedResources, setSelectedResources] = useState<Resource[]>([]);
  const [selectedDownloadable, setSelectedDownloadable] = useState<PreparedResource[]>([]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'crawler', label: 'Web Crawler', icon: '🕷️' },
    { id: 'jobs', label: 'Jobs', icon: '⚙️' },
    { id: 'storage', label: 'Storage', icon: '💾' }
  ] as const;

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const response = await fetch('/api/admin/jobs');
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      // Mock data for demo
      setJobs([
        {
          jobId: '1',
          websiteUrl: 'https://www.irs.gov/forms-instructions-and-publications',
          stage: 'completed',
          progress: 100,
          status: 'completed',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date().toISOString(),
          discoveryCount: 150,
          preparationCount: 45,
          selectionCount: 20,
          downloadedCount: 20,
          processedCount: 18,
          embeddedCount: 15
        },
        {
          jobId: '2',
          websiteUrl: 'https://www.irs.gov/businesses',
          stage: 'selection',
          progress: 65,
          status: 'running',
          createdAt: new Date(Date.now() - 1800000).toISOString(),
          updatedAt: new Date().toISOString(),
          discoveryCount: 200,
          preparationCount: 60,
          selectionCount: 25,
          downloadedCount: 15,
          processedCount: 10,
          embeddedCount: 8
        }
      ]);
    }
  };

  const startCrawler = async () => {
    if (!crawlerUrl.trim()) {
      alert('Please enter a URL');
      return;
    }

    setIsLoading(true);
    try {
      // Create new job
      const createResponse = await fetch('/api/admin/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          websiteUrl: crawlerUrl
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create job');
      }

      const createData = await createResponse.json();
      const jobId = createData.job.jobId;

      // Start discovery stage
      const discoveryResponse = await fetch(`/api/admin/jobs/${jobId}/discovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (discoveryResponse.ok) {
        alert('Crawler job started successfully! Job ID: ' + jobId);
        setCrawlerUrl('');
        setTimeout(loadJobs, 2000);
      } else {
        throw new Error('Failed to start discovery');
      }
    } catch (error) {
      console.error('Error starting crawler:', error);
      alert('Failed to start crawler');
    } finally {
      setIsLoading(false);
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'discovery': return 'bg-blue-100 text-blue-800';
      case 'preparation': return 'bg-yellow-100 text-yellow-800';
      case 'selection': return 'bg-purple-100 text-purple-800';
      case 'downloading': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimestamp = (timestamp: string | Date) => {
    return new Date(timestamp).toLocaleString();
  };

  const startPreparation = async (jobId: string, resources: Resource[]) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/preparation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedResources: resources
        }),
      });

      if (response.ok) {
        alert('Preparation stage started!');
        setTimeout(loadJobs, 2000);
      } else {
        throw new Error('Failed to start preparation');
      }
    } catch (error) {
      console.error('Error starting preparation:', error);
      alert('Failed to start preparation');
    } finally {
      setIsLoading(false);
    }
  };

  const startSelection = async (jobId: string, resources: PreparedResource[]) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/jobs/${jobId}/selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          selectedResources: resources
        }),
      });

      if (response.ok) {
        alert('Selection stage started!');
        setTimeout(loadJobs, 2000);
      } else {
        throw new Error('Failed to start selection');
      }
    } catch (error) {
      console.error('Error starting selection:', error);
      alert('Failed to start selection');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-600">Web crawler and document management</p>
          </div>
          <button
            onClick={loadJobs}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">System Overview</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">{jobs.length}</div>
                <div className="text-sm text-blue-800">Total Jobs</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {jobs.filter(j => j.stage === 'completed').length}
                </div>
                <div className="text-sm text-green-800">Completed</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-600">
                  {jobs.filter(j => j.stage !== 'completed' && j.stage !== 'error').length}
                </div>
                <div className="text-sm text-yellow-800">In Progress</div>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('crawler')}
                  className="p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
                >
                  <div className="text-lg font-medium text-gray-900">Start New Crawl</div>
                  <div className="text-sm text-gray-600">Begin crawling a website</div>
                </button>
                <button
                  onClick={() => setActiveTab('jobs')}
                  className="p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
                >
                  <div className="text-lg font-medium text-gray-900">View Jobs</div>
                  <div className="text-sm text-gray-600">Monitor active jobs</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'crawler' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Web Crawler</h2>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Start New Crawl Job</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Website URL
                  </label>
                  <input
                    type="url"
                    value={crawlerUrl}
                    onChange={(e) => setCrawlerUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://www.irs.gov/forms-instructions-and-publications"
                  />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Processing Stages</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <div>1. <strong>Discovery:</strong> Find all relevant resources and rank by importance</div>
                    <div>2. <strong>Preparation:</strong> Filter downloadable URLs and collect metadata</div>
                    <div>3. <strong>Selection:</strong> Choose which resources to download</div>
                  </div>
                </div>
                
                <button
                  onClick={startCrawler}
                  disabled={isLoading || !crawlerUrl.trim()}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Starting...' : 'Start Crawl Job'}
                </button>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-yellow-900 mb-2">⚠️ Important Notes</h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• The crawler will discover resources in three stages</li>
                <li>• You can monitor progress in the Jobs tab</li>
                <li>• Each stage requires manual review and selection</li>
                <li>• Downloaded files are stored locally in organized folders</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Crawler Jobs</h2>
            
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <span className="text-sm font-medium text-gray-700">Active Jobs</span>
              </div>
              
              <div className="divide-y divide-gray-200">
                {jobs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    No jobs found. Start a new crawl job to begin.
                  </div>
                ) : (
                  jobs.map((job) => (
                    <div key={job.jobId} className="px-4 py-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <span className={`px-2 py-1 text-xs rounded-full ${getStageColor(job.stage)}`}>
                              {job.stage}
                            </span>
                            <div>
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {job.websiteUrl}
                              </div>
                              <div className="text-sm text-gray-500">
                                {job.status}
                              </div>
                            </div>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span>Progress</span>
                              <span>{job.progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${job.progress}%` }}
                              ></div>
                            </div>
                          </div>
                          
                          <div className="mt-2 text-xs text-gray-400">
                            Created: {formatTimestamp(job.createdAt)}
                          </div>
                        </div>
                        
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-900">Local Storage</h2>
            
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Storage Structure</h3>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-sm">
                <div>📁 storage/</div>
                <div className="ml-4">
                  <div>📁 documents/</div>
                  <div className="ml-4">
                    <div>📁 irs.gov/</div>
                    <div className="ml-4">
                      <div>📁 forms/</div>
                      <div>📁 instructions/</div>
                      <div>📁 publications/</div>
                    </div>
                  </div>
                </div>
                <div>📄 metadata.json</div>
                <div>📄 embeddings.json</div>
              </div>
              
              <div className="mt-4 text-sm text-gray-600">
                <p>Files are organized by source domain and category. Metadata and embeddings are stored as JSON files for easy access.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-3/4 max-h-3/4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Job Details</h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700">URL</h3>
                <p className="text-sm text-gray-900">{selectedJob.websiteUrl}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700">Status</h3>
                <span className={`px-2 py-1 text-xs rounded-full ${getStageColor(selectedJob.stage)}`}>
                  {selectedJob.stage}
                </span>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700">Progress</h3>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div 
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${selectedJob.progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{selectedJob.progress}% complete</p>
              </div>

              {/* Stage-specific content */}
              {selectedJob.stage === 'preparation' && selectedJob.discoveryResults && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Discovered Resources ({selectedJob.discoveryResults.totalResources})</h3>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                    {selectedJob.discoveryResults.resources.slice(0, 10).map((resource, index) => (
                      <div key={index} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedResources.some(r => r.url === resource.url)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedResources([...selectedResources, resource]);
                            } else {
                              setSelectedResources(selectedResources.filter(r => r.url !== resource.url));
                            }
                          }}
                        />
                        <span className="text-xs text-gray-600 truncate">{resource.title}</span>
                        <span className="text-xs text-gray-400">({resource.importance})</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => startPreparation(selectedJob.jobId, selectedResources)}
                    disabled={selectedResources.length === 0 || isLoading}
                    className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Start Preparation ({selectedResources.length} selected)
                  </button>
                </div>
              )}

              {selectedJob.stage === 'selection' && selectedJob.preparationResults && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Downloadable Resources ({selectedJob.preparationResults.totalDownloadable})</h3>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                    {selectedJob.preparationResults.downloadableResources.slice(0, 10).map((resource, index) => (
                      <div key={index} className="flex items-center space-x-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedDownloadable.some(r => r.url === resource.url)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDownloadable([...selectedDownloadable, resource]);
                            } else {
                              setSelectedDownloadable(selectedDownloadable.filter(r => r.url !== resource.url));
                            }
                          }}
                        />
                        <span className="text-xs text-gray-600 truncate">{resource.name}</span>
                        <span className="text-xs text-gray-400">({resource.fileSize} bytes)</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => startSelection(selectedJob.jobId, selectedDownloadable)}
                    disabled={selectedDownloadable.length === 0 || isLoading}
                    className="mt-2 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    Start Download & Process ({selectedDownloadable.length} selected)
                  </button>
                </div>
              )}

              {selectedJob.stage === 'completed' && selectedJob.selectionResults && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Results</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>Downloaded: {selectedJob.selectionResults.downloadedCount}</div>
                    <div>Processed: {selectedJob.selectionResults.processedCount}</div>
                    <div>Embedded: {selectedJob.selectionResults.embeddedCount}</div>
                    <div>Total: {selectedJob.selectionResults.totalSelected}</div>
                  </div>
                </div>
              )}
              
              {selectedJob.errorMessage && (
                <div>
                  <h3 className="text-sm font-medium text-red-700">Error</h3>
                  <p className="text-sm text-red-600">{selectedJob.errorMessage}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Created:</span>
                  <p>{formatTimestamp(selectedJob.createdAt)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Updated:</span>
                  <p>{formatTimestamp(selectedJob.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 