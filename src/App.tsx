/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { api, Project, TestCase } from "@/src/services/api";
import { Sparkles, RefreshCw, Download, Trash2, Edit2, CheckSquare, Loader2, RotateCcw, ChevronDown, ChevronUp, Folder, Plus, MoreVertical, PanelLeft, Settings } from "lucide-react";
import * as XLSX from 'xlsx-js-style';

export default function App() {
  const isGeneratingRef = React.useRef(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [newRequirements, setNewRequirements] = useState("");
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [projectsTableId, setProjectsTableId] = useState("");
  const [testCasesTableId, setTestCasesTableId] = useState("");

  // Project Modals
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjectName, setEditProjectName] = useState("");

  // Edit Modal State
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null);
  const [operationStatus, setOperationStatus] = useState("");

  // Load Projects on Mount
  useEffect(() => {
    loadProjects();
  }, []);

  const saveSettings = () => {
    localStorage.setItem("BASEROW_PROJECTS_TABLE_ID", projectsTableId);
    localStorage.setItem("BASEROW_TESTCASES_TABLE_ID", testCasesTableId);
    setIsSettingsOpen(false);
    toast.success("Settings saved");
    loadProjects();
  };

  const loadProjects = async (preferredProjectId?: string | null) => {
    try {
      const data = await api.getProjects();
      setProjects(data);

      if (data.length === 0) {
        setSelectedProjectId(null);
        return;
      }

      if (preferredProjectId && data.some((p) => p._id === preferredProjectId)) {
        setSelectedProjectId(preferredProjectId);
        return;
      }

      if (selectedProjectId && data.some((p) => p._id === selectedProjectId)) {
        return;
      }

      setSelectedProjectId(data[0]._id);
    } catch (error) {
      toast.error("Failed to load projects");
    }
  };

  // Load Test Cases when Project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadTestCases(selectedProjectId);
    } else {
      setTestCases([]);
    }
  }, [selectedProjectId]);

  const loadTestCases = async (projectId: string) => {
    try {
      const data = await api.getTestCases(projectId);
      setTestCases(data);
      setSelectedIds(new Set());
      setExpandedIds(new Set());
    } catch (error) {
      toast.error("Failed to load test cases");
    }
  };

  const selectedProject = useMemo(() => projects.find(p => p._id === selectedProjectId), [projects, selectedProjectId]);

  // Project Actions
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const project = await api.createProject(newProjectName);
      await loadProjects(project._id);
      await loadTestCases(project._id);
      setIsCreateProjectOpen(false);
      setNewProjectName("");
      toast.success("Project created");
    } catch (error) {
      toast.error("Failed to create project");
    }
  };

  const handleRenameProject = async () => {
    if (!editingProject || !editProjectName.trim()) return;
    try {
      await api.updateProject(editingProject._id, editProjectName, editingProject.context);
      await loadProjects(editingProject._id);
      setEditingProject(null);
      toast.success("Project renamed");
    } catch (error) {
      toast.error("Failed to rename project");
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project and all its test cases?")) return;
    try {
      await api.deleteProject(id);
      await loadProjects(selectedProjectId === id ? null : selectedProjectId);
      toast.success("Project deleted");
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  const handleUpdateContext = async (newContext: string) => {
    if (!selectedProject) return;
    try {
      const updated = await api.updateProject(selectedProject._id, selectedProject.name, newContext);
      setProjects(projects.map(p => p._id === updated._id ? updated : p));
    } catch (error) {
      toast.error("Failed to update context");
    }
  };

  // Test Case Actions
  const handleGenerate = async () => {
    if (isGeneratingRef.current) {
      return;
    }

    if (!selectedProjectId) {
      toast.error("Please select or create a project first.");
      return;
    }
    if (!newRequirements.trim()) {
      toast.error("Please enter new requirements.");
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);
    setOperationStatus("Generating test cases...");
    try {
      const { testCases: newTestCases, updatedContext } = await api.generateTestCases(selectedProjectId, newRequirements);

      await loadProjects(selectedProjectId);
      await loadTestCases(selectedProjectId);

      const newIds = new Set(newTestCases.map((tc) => tc._id));
      setSelectedIds(newIds);
      setExpandedIds(newIds);
      setNewRequirements(""); // Clear input after success
      toast.success(`Generated ${newTestCases.length} new test cases!`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate test cases. Please try again.");
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
      setOperationStatus("");
    }
  };

  const handleSelectAll = () => {
    if (filteredTestCases.length === 0) return;

    if (selectedIds.size === filteredTestCases.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTestCases.map((tc) => tc._id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const getThrottleWaitMs = (message: string): number | null => {
    const match = message.match(/Expected available in\s+(\d+)\s+seconds?/i);
    if (!match) return null;
    const seconds = Number.parseInt(match[1], 10);
    if (Number.isNaN(seconds) || seconds <= 0) return null;
    return (seconds + 1) * 1000;
  };

  const deleteWithRetry = async (id: string, maxAttempts = 3): Promise<void> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await api.deleteTestCase(id);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const waitMs = getThrottleWaitMs(message);

        if (waitMs && attempt < maxAttempts) {
          toast.info(`Rate limited. Retrying in ${Math.ceil(waitMs / 1000)}s...`);
          await sleep(waitMs);
          continue;
        }

        throw error;
      }
    }
  };

  const handleDeleteSingle = async (id: string) => {
    if (!confirm("Delete this test case?")) return;
    setIsDeleting(true);
    setDeleteProgress({ current: 0, total: 1 });
    setOperationStatus("Deleting test case... 0/1");
    try {
      await deleteWithRetry(id);
      setDeleteProgress({ current: 1, total: 1 });
      setOperationStatus("Deleting test case... 1/1");
      if (selectedProjectId) {
        await loadTestCases(selectedProjectId);
      }
      toast.success("Deleted test case.");
    } catch (error) {
      toast.error("Failed to delete test case");
    } finally {
      setIsDeleting(false);
      setDeleteProgress(null);
      setOperationStatus("");
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      toast.error("No test case selected.");
      return;
    }

    if (!confirm(`Delete ${selectedIds.size} selected test case(s)?`)) return;

    setIsDeleting(true);
    setDeleteProgress({ current: 0, total: selectedIds.size });
    setOperationStatus(`Deleting test cases... 0/${selectedIds.size}`);

    try {
      const ids = Array.from(selectedIds.values()) as string[];
      let deletedCount = 0;
      let failedCount = 0;

      for (let index = 0; index < ids.length; index++) {
        const id = ids[index];
        try {
          await deleteWithRetry(id);
          deletedCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error(`Failed to delete test case ${id}:`, error);
        }

        const current = index + 1;
        setDeleteProgress({ current, total: ids.length });
        setOperationStatus(`Deleting test cases... ${current}/${ids.length}`);

        // Small gap between requests to avoid burst throttling.
        await sleep(150);
      }

      if (selectedProjectId) {
        await loadTestCases(selectedProjectId);
      }

      if (failedCount === 0) {
        toast.success(`Deleted ${deletedCount} selected test case(s).`);
      } else if (deletedCount > 0) {
        toast.error(`Deleted ${deletedCount}, failed ${failedCount}. Please retry failed items.`);
      } else {
        toast.error("Failed to delete selected test cases.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete selected test cases";
      toast.error(message);
    } finally {
      setIsDeleting(false);
      setDeleteProgress(null);
      setOperationStatus("");
    }
  };

  const handleExport = () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one test case to export.");
      return;
    }

    const selectedCases = testCases.filter((tc) => selectedIds.has(tc._id));
    
    // Create worksheet data
    const wsData: any[][] = [];
    
    // Rows 1-3 empty
    wsData.push([]);
    wsData.push([]);
    wsData.push([]);
    
    // Row 4: Header
    const headers = ["ID", "Test Case", "Pre-Condition", "Test Steps", "Test Data", "Expected Result"];
    wsData.push(headers);
    
    // Rows 5+: Data
    selectedCases.forEach((tc, index) => {
      wsData.push([
        `TC_${String(index + 1).padStart(2, '0')}`,
        tc.title,
        tc.preconditions,
        tc.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        "", // Test Data
        tc.expected_result
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply styles to header row (Row 4, index 3)
    const headerStyle = {
      fill: { fgColor: { rgb: "FFFF00" } }, // Yellow background
      font: { bold: true, color: { rgb: "000000" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    const dataStyle = {
      alignment: { vertical: "top", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      }
    };

    // Apply styles to all cells
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:F1");
    for (let R = 3; R <= range.e.r; ++R) {
      for (let C = 0; C <= range.e.c; ++C) {
        const cellAddress = { c: C, r: R };
        const cellRef = XLSX.utils.encode_cell(cellAddress);
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' }; // Ensure cell exists
        
        if (R === 3) {
          ws[cellRef].s = headerStyle;
        } else {
          ws[cellRef].s = dataStyle;
        }
      }
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 10 },  // ID
      { wch: 40 },  // Test Case
      { wch: 30 },  // Pre-Condition
      { wch: 50 },  // Test Steps
      { wch: 20 },  // Test Data
      { wch: 40 },  // Expected Result
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
    
    // Generate buffer and save
    XLSX.writeFile(wb, `${selectedProject?.name || 'test_cases'}.xlsx`);
    toast.success("Exported to Excel.");
  };

  const openEditModal = (tc: TestCase) => {
    setEditingTestCase(tc);
    setEditTitle(tc.title);
    setEditDescription(tc.description);
  };

  const handleSaveEdit = async () => {
    if (!editingTestCase) return;

    if (editTitle === editingTestCase.title && editDescription === editingTestCase.description) {
      setEditingTestCase(null);
      return;
    }

    setIsUpdating(true);
    try {
      await api.smartEditTestCase(editingTestCase._id, editTitle, editDescription);
      if (selectedProjectId) {
        await loadTestCases(selectedProjectId);
      }
      toast.success("Test case updated intelligently by AI!");
      setEditingTestCase(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update test case.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRegenerateSingle = async (tc: TestCase) => {
    setRegeneratingId(tc._id);
    try {
      await api.regenerateTestCase(tc._id);
      if (selectedProjectId) {
        await loadTestCases(selectedProjectId);
      }
      toast.success("Test case regenerated successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to regenerate test case.");
    } finally {
      setRegeneratingId(null);
    }
  };

  const filteredTestCases = useMemo(() => {
    if (activeTab === "All") return testCases;
    return testCases.filter((tc) => tc.type === activeTab);
  }, [testCases, activeTab]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Positive Flow": return "bg-green-100 text-green-800 border-green-200";
      case "Negative Flow": return "bg-red-100 text-red-800 border-red-200";
      case "Edge Case": return "bg-amber-100 text-amber-800 border-amber-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Left Panel: Projects Sidebar */}
      <div className={`h-full flex flex-col bg-slate-900 text-slate-300 shrink-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64 border-r' : 'w-0 overflow-hidden'}`}>
        <div className="w-64 h-full flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Folder className="w-4 h-4" /> Projects
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setIsCreateProjectOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {projects.map(p => (
            <div 
              key={p._id}
              onClick={() => setSelectedProjectId(p._id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${selectedProjectId === p._id ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
            >
              <span className="truncate text-sm font-medium">{p.name}</span>
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-white" onClick={(e) => { e.stopPropagation(); setEditingProject(p); setEditProjectName(p.name); }}>
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-400" onClick={(e) => handleDeleteProject(p._id, e)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="text-center p-4 text-sm text-slate-500">No projects yet. Create one!</div>
          )}
        </div>
        </div>
      </div>

      {/* Middle Panel: Test Cases */}
      <div className="flex-1 h-full flex flex-col border-r bg-white shadow-sm z-10 min-w-0">
        <div className="p-4 border-b flex items-center justify-between bg-white shrink-0">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-slate-800 truncate">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="h-8 w-8 -ml-2 text-slate-500 hover:text-slate-700 shrink-0" title="Toggle Sidebar">
              <PanelLeft className="w-5 h-5" />
            </Button>
            <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" />
            <span className="truncate">{selectedProject ? selectedProject.name : 'Select a Project'}</span>
            <Badge variant="secondary" className="ml-2 bg-slate-100 text-slate-600 shrink-0">{testCases.length}</Badge>
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={filteredTestCases.length === 0 || isGenerating || isDeleting} className="text-slate-600">
              {selectedIds.size === filteredTestCases.length && filteredTestCases.length > 0 ? "Unselect All" : "Select All"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeleteSelected} disabled={selectedIds.size === 0 || isGenerating || isDeleting} className="text-red-600 hover:text-red-700 hover:bg-red-50">
              {isDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />} Delete
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={selectedIds.size === 0 || isGenerating || isDeleting} className="text-slate-600">
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          </div>
        </div>

        {(isGenerating || isDeleting) && (
          <div className="px-4 py-2 border-b bg-blue-50 text-blue-700 text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{operationStatus || "Processing..."}</span>
            {deleteProgress && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">{deleteProgress.current}/{deleteProgress.total}</Badge>
            )}
          </div>
        )}

        <div className="px-4 pt-2 shrink-0">
          <Tabs defaultValue="All" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4 bg-slate-100">
              <TabsTrigger value="All">All</TabsTrigger>
              <TabsTrigger value="Positive Flow" className="data-[state=active]:text-green-700">Positive</TabsTrigger>
              <TabsTrigger value="Negative Flow" className="data-[state=active]:text-red-700">Negative</TabsTrigger>
              <TabsTrigger value="Edge Case" className="data-[state=active]:text-amber-700">Edge Cases</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {!selectedProject ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Folder className="w-12 h-12 mb-4 opacity-20" />
              <p>Select or create a project to view test cases.</p>
            </div>
          ) : testCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Sparkles className="w-12 h-12 mb-4 opacity-20" />
              <p>No test cases generated yet.</p>
              <p className="text-sm">Enter requirements on the right and click Generate.</p>
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              {filteredTestCases.map((tc) => (
                <Card key={tc._id} className={`transition-all duration-200 border-l-4 ${selectedIds.has(tc._id) ? 'border-l-blue-500 shadow-md' : 'border-l-transparent hover:shadow-md'}`}>
                  <CardHeader className="py-3 px-4 flex flex-row items-start gap-3 space-y-0">
                    <Checkbox 
                      checked={selectedIds.has(tc._id)} 
                      onCheckedChange={() => toggleSelect(tc._id)}
                      disabled={isGenerating || isDeleting}
                      className="mt-1"
                    />
                    <div className="flex-1 cursor-pointer min-w-0" onClick={() => toggleExpand(tc._id)}>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-medium text-slate-800 leading-tight">
                          {tc.title}
                        </CardTitle>
                        <div className="flex -mt-1 -mr-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={() => handleRegenerateSingle(tc)} disabled={regeneratingId === tc._id || isGenerating || isDeleting}>
                            <RotateCcw className={`w-3.5 h-3.5 ${regeneratingId === tc._id ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={() => openEditModal(tc)} disabled={regeneratingId === tc._id || isGenerating || isDeleting}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-600" onClick={() => handleDeleteSingle(tc._id)} disabled={regeneratingId === tc._id || isGenerating || isDeleting}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={() => toggleExpand(tc._id)}>
                            {expandedIds.has(tc._id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      <CardDescription className={`text-sm text-slate-500 mt-1 ${expandedIds.has(tc._id) ? '' : 'line-clamp-2'}`}>
                        {tc.description}
                      </CardDescription>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className={`text-xs font-normal ${getTypeColor(tc.type)}`}>
                          {tc.type}
                        </Badge>
                        <Badge variant="outline" className="text-xs font-normal text-slate-500 bg-slate-50">
                          {tc.priority}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  {expandedIds.has(tc._id) && (
                    <CardContent className="px-4 pb-4 pt-0 text-sm text-slate-600 bg-slate-50/50 border-t mt-2">
                      <div className="mt-3 space-y-3">
                        <div>
                          <strong className="text-slate-700 text-xs uppercase tracking-wider">Preconditions:</strong>
                          <p className="mt-1">{tc.preconditions}</p>
                        </div>
                        <div>
                          <strong className="text-slate-700 text-xs uppercase tracking-wider">Steps:</strong>
                          <ol className="list-decimal list-inside mt-1 space-y-1">
                            {tc.steps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </div>
                        <div>
                          <strong className="text-slate-700 text-xs uppercase tracking-wider">Expected Result:</strong>
                          <p className="mt-1 font-medium text-slate-800">{tc.expected_result}</p>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Project Context & Requirements */}
      <div className="w-[400px] h-full flex flex-col bg-slate-50 shrink-0">
        <div className="p-4 border-b bg-white flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Context & Requirements</h2>
        </div>
        
        <div className="flex-1 p-4 flex flex-col gap-4 min-h-0 overflow-y-auto">
          {!selectedProject ? (
            <div className="text-center text-slate-400 mt-10 text-sm">Select a project to view context.</div>
          ) : (
            <>
              {/* Project Context */}
              <div className="flex flex-col bg-white rounded-xl shadow-sm border overflow-hidden shrink-0">
                <div className="p-3 border-b bg-slate-50/80 text-sm text-slate-700 font-semibold flex justify-between items-center">
                  <span>Project Context (Markdown)</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => {
                      if (confirm("Are you sure you want to clear the project context?")) {
                        handleUpdateContext("");
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Clear
                  </Button>
                </div>
                <Textarea 
                  className="w-full border-0 focus-visible:ring-0 resize-none p-3 text-sm leading-relaxed text-slate-600 rounded-none h-48"
                  placeholder="Describe the overall project, architecture, or general rules here. This context is sent to AI with every generation request."
                  value={selectedProject.context}
                  onChange={(e) => handleUpdateContext(e.target.value)}
                />
              </div>

              {/* New Requirements */}
              <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border overflow-hidden min-h-[200px]">
                <div className="p-3 border-b bg-blue-50/80 text-sm text-blue-800 font-semibold flex justify-between items-center">
                  New Requirements
                </div>
                <Textarea 
                  className="flex-1 border-0 focus-visible:ring-0 resize-none p-3 text-sm leading-relaxed text-slate-700 rounded-none"
                  placeholder="Paste new feature requirements here. AI will generate test cases and append them to the project."
                  value={newRequirements}
                  onChange={(e) => setNewRequirements(e.target.value)}
                />
                <div className="p-3 border-t bg-slate-50">
                  <Button 
                    onClick={handleGenerate} 
                    disabled={isGenerating || isDeleting || !newRequirements.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  >
                    {isGenerating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" /> Generate & Append</>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      
      {/* Create Project Modal */}
      <Dialog open={isCreateProjectOpen} onOpenChange={setIsCreateProjectOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={newProjectName} 
              onChange={(e) => setNewProjectName(e.target.value)} 
              placeholder="Project Name (e.g., Auth Module)"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Project Modal */}
      <Dialog open={!!editingProject} onOpenChange={(open) => !open && setEditingProject(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={editProjectName} 
              onChange={(e) => setEditProjectName(e.target.value)} 
              placeholder="Project Name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRenameProject()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProject(null)}>Cancel</Button>
            <Button onClick={handleRenameProject} disabled={!editProjectName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Test Case Modal */}
      <Dialog open={!!editingTestCase} onOpenChange={(open) => !open && setEditingTestCase(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-blue-600" />
              Smart Edit Test Case
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Title</label>
              <Input 
                value={editTitle} 
                onChange={(e) => setEditTitle(e.target.value)} 
                placeholder="Test case title"
                className="font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Description</label>
              <Textarea 
                value={editDescription} 
                onChange={(e) => setEditDescription(e.target.value)} 
                placeholder="Test case description"
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                When you save, the AI will automatically rewrite the <strong>Steps</strong> and <strong>Expected Result</strong> to align with your new title and description, while keeping the original requirements in context.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTestCase(null)} disabled={isUpdating}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isUpdating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI Updating...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Save & Auto-Update</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Toaster position="bottom-right" />
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Baserow Configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Projects Table ID</label>
              <Input 
                value={projectsTableId} 
                onChange={(e) => setProjectsTableId(e.target.value)} 
                placeholder="e.g. 123456"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Test Cases Table ID</label>
              <Input 
                value={testCasesTableId} 
                onChange={(e) => setTestCasesTableId(e.target.value)} 
                placeholder="e.g. 123457"
              />
            </div>
            <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-md">
              <p className="font-semibold mb-1">Cấu trúc bảng cần tạo trên Baserow:</p>
              <p className="font-medium mt-2">Bảng Projects:</p>
              <ul className="list-disc pl-4 mb-2">
                <li>name (Single line text)</li>
                <li>context (Long text)</li>
                <li>createdAt (Created on)</li>
              </ul>
              <p className="font-medium mt-2">Bảng Test Cases:</p>
              <ul className="list-disc pl-4">
                <li>projectId (Single line text)</li>
                <li>title (Single line text)</li>
                <li>description (Long text)</li>
                <li>preconditions (Long text)</li>
                <li>steps (Long text)</li>
                <li>expected_result (Long text)</li>
                <li>type (Single select: Positive Flow, Negative Flow, Edge Case)</li>
                <li>priority (Single select: High, Medium, Low)</li>
                <li>createdAt (Created on)</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveSettings}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

