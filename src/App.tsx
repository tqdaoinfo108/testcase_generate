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
import { Sparkles, RefreshCw, Download, Trash2, Edit2, CheckSquare, Loader2, RotateCcw, ChevronDown, ChevronUp, Folder, Plus, MoreVertical, PanelLeft } from "lucide-react";
import * as XLSX from 'xlsx-js-style';

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [newRequirements, setNewRequirements] = useState("");
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  // Load Projects on Mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data[0]._id);
      }
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
      setProjects([project, ...projects]);
      setSelectedProjectId(project._id);
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
      const updated = await api.updateProject(editingProject._id, editProjectName, editingProject.context);
      setProjects(projects.map(p => p._id === updated._id ? updated : p));
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
      setProjects(projects.filter(p => p._id !== id));
      if (selectedProjectId === id) {
        setSelectedProjectId(projects.length > 1 ? projects.find(p => p._id !== id)!._id : null);
      }
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
    if (!selectedProjectId) {
      toast.error("Please select or create a project first.");
      return;
    }
    if (!newRequirements.trim()) {
      toast.error("Please enter new requirements.");
      return;
    }

    setIsGenerating(true);
    try {
      const { testCases: newTestCases, updatedContext } = await api.generateTestCases(selectedProjectId, newRequirements);
      
      // Update local state
      setTestCases([...newTestCases, ...testCases]);
      
      // Update project context
      if (selectedProject) {
        setProjects(projects.map(p => p._id === selectedProjectId ? { ...p, context: updatedContext } : p));
      }

      const newIds = new Set(newTestCases.map((tc) => tc._id));
      setSelectedIds(newIds);
      setExpandedIds(newIds);
      setNewRequirements(""); // Clear input after success
      toast.success(`Generated ${newTestCases.length} new test cases!`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to generate test cases. Please try again.";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectAll = () => {
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

  const handleDeleteSelected = async () => {
    if (!confirm("Delete selected test cases?")) return;
    try {
      for (const id of selectedIds) {
        await api.deleteTestCase(id);
      }
      setTestCases(testCases.filter((tc) => !selectedIds.has(tc._id)));
      setSelectedIds(new Set());
      toast.success("Deleted selected test cases.");
    } catch (error) {
      toast.error("Failed to delete some test cases");
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
      const updatedTc = await api.smartEditTestCase(editingTestCase._id, editTitle, editDescription);
      setTestCases(testCases.map((tc) => tc._id === updatedTc._id ? updatedTc : tc));
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
      const regeneratedTc = await api.regenerateTestCase(tc._id);
      setTestCases(testCases.map((t) => t._id === regeneratedTc._id ? regeneratedTc : t));
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
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white" onClick={() => setIsCreateProjectOpen(true)}>
            <Plus className="w-4 h-4" />
          </Button>
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
            <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={testCases.length === 0} className="text-slate-600">
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeleteSelected} disabled={selectedIds.size === 0} className="text-red-600 hover:text-red-700 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={selectedIds.size === 0} className="text-slate-600">
              <Download className="w-4 h-4 mr-1" /> Export
            </Button>
          </div>
        </div>

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
                      className="mt-1"
                    />
                    <div className="flex-1 cursor-pointer min-w-0" onClick={() => toggleExpand(tc._id)}>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-medium text-slate-800 leading-tight">
                          {tc.title}
                        </CardTitle>
                        <div className="flex -mt-1 -mr-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={() => handleRegenerateSingle(tc)} disabled={regeneratingId === tc._id}>
                            <RotateCcw className={`w-3.5 h-3.5 ${regeneratingId === tc._id ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={() => openEditModal(tc)} disabled={regeneratingId === tc._id}>
                            <Edit2 className="w-3.5 h-3.5" />
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
                    disabled={isGenerating || !newRequirements.trim()}
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
    </div>
  );
}

