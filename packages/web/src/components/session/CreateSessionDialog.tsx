// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppStore } from '@/store/useAppStore';
import { Loader2 } from 'lucide-react';
import {
  ClaudeIcon,
  CursorIcon,
  OpenCodeIcon,
  TerminalIcon,
  AgentIcon,
} from '@/components/icons';
import type { SessionType } from '@/types';

interface CreateSessionDialogProps {
  children: React.ReactNode;
}

// Fallback agents when server hasn't provided the list yet
const FALLBACK_AGENTS = [
  { name: 'claude', baseType: 'claude' as SessionType, displayName: 'Claude', isAlias: false },
  { name: 'cursor', baseType: 'cursor' as SessionType, displayName: 'Cursor', isAlias: false },
  { name: 'opencode', baseType: 'opencode' as SessionType, displayName: 'OpenCode', isAlias: false },
];

export function CreateSessionDialog({ children }: CreateSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<string>('claude');
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isTerminal, setIsTerminal] = useState(false);

  const { createSession, subscribeToSession, requestSync } = useWebSocket();
  const selectSession = useAppStore((state) => state.selectSession);
  const availableAgents = useAppStore((state) => state.availableAgents);
  const workspaces = useAppStore((state) => state.workspaces);
  const navigate = useNavigate();

  // Use available agents from store, or fallback to default list
  const agents = useMemo(() => {
    return availableAgents.length > 0 ? availableAgents : FALLBACK_AGENTS;
  }, [availableAgents]);

  // Get projects for selected workspace
  const projects = useMemo(() => {
    const ws = workspaces.find((w) => w.name === selectedWorkspace);
    return ws?.projects ?? [];
  }, [workspaces, selectedWorkspace]);

  // Request fresh data when dialog opens
  useEffect(() => {
    if (open) {
      requestSync();
    }
  }, [open, requestSync]);

  // Reset project when workspace changes
  useEffect(() => {
    setSelectedProject('');
  }, [selectedWorkspace]);

  // Set default agent when agents list updates
  useEffect(() => {
    if (agents.length > 0 && !agents.find((a) => a.name === selectedAgent)) {
      setSelectedAgent(agents[0]?.name ?? 'claude');
    }
  }, [agents, selectedAgent]);

  const handleCreate = useCallback(async () => {
    if (!isTerminal && (!selectedWorkspace || !selectedProject)) {
      setError('Workspace and project are required for agent sessions');
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const agentConfig = agents.find((a) => a.name === selectedAgent);
      const sessionType = isTerminal ? 'terminal' : (agentConfig?.baseType ?? 'claude');

      // For terminal sessions, use defaults if not provided (matches iOS/Android behavior)
      const finalWorkspace = isTerminal ? (selectedWorkspace || 'home') : selectedWorkspace;
      const finalProject = isTerminal ? (selectedProject || 'default') : selectedProject;

      const result = await createSession(
        sessionType as 'claude' | 'cursor' | 'opencode' | 'terminal',
        finalWorkspace,
        finalProject,
        undefined,
        isTerminal ? undefined : selectedAgent
      );

      const sessionId = result.payload.session_id;

      // Subscribe to the new session
      subscribeToSession(sessionId);

      // Select the session and navigate
      selectSession(sessionId);
      if (isTerminal) {
        navigate(`/terminal/${sessionId}`);
      } else {
        navigate(`/chat/${sessionId}`);
      }

      // Reset form and close dialog
      setOpen(false);
      setSelectedWorkspace('');
      setSelectedProject('');
      setSelectedAgent(agents[0]?.name ?? 'claude');
      setIsTerminal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  }, [
    createSession,
    subscribeToSession,
    selectSession,
    navigate,
    selectedAgent,
    selectedWorkspace,
    selectedProject,
    isTerminal,
    agents,
  ]);

  const getAgentIcon = (baseType: SessionType) => {
    switch (baseType) {
      case 'claude':
        return <ClaudeIcon className="w-4 h-4" />;
      case 'cursor':
        return <CursorIcon className="w-4 h-4" />;
      case 'opencode':
        return <OpenCodeIcon className="w-4 h-4" />;
      case 'terminal':
        return <TerminalIcon className="w-4 h-4" />;
      default:
        return <AgentIcon className="w-4 h-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Session</DialogTitle>
          <DialogDescription>
            Start a new agent or terminal session
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Session Type Toggle */}
          <div className="grid gap-2">
            <Label>Session Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={!isTerminal ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setIsTerminal(false)}
              >
                <AgentIcon className="w-4 h-4 mr-2" />
                Agent
              </Button>
              <Button
                type="button"
                variant={isTerminal ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setIsTerminal(true)}
              >
                <TerminalIcon className="w-4 h-4 mr-2" />
                Terminal
              </Button>
            </div>
          </div>

          {/* Agent Selection (only for non-terminal) */}
          {!isTerminal && (
            <div className="grid gap-2">
              <Label htmlFor="agent">Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger id="agent">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.name} value={agent.name}>
                      <div className="flex items-center gap-2">
                        {getAgentIcon(agent.baseType)}
                        <span>{agent.displayName}</span>
                        {agent.isAlias && (
                          <span className="text-xs text-muted-foreground">(alias)</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableAgents.find((a) => a.name === selectedAgent)?.description && (
                <p className="text-xs text-muted-foreground">
                  {availableAgents.find((a) => a.name === selectedAgent)?.description}
                </p>
              )}
            </div>
          )}

          {/* Workspace & Project (only for agent sessions) */}
          {!isTerminal && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="workspace">Workspace</Label>
                <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                  <SelectTrigger id="workspace">
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.length > 0 ? (
                      workspaces.map((ws) => (
                        <SelectItem key={ws.name} value={ws.name}>
                          {ws.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="_empty" disabled>
                        No workspaces available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="project">Project</Label>
                <Select
                  value={selectedProject}
                  onValueChange={setSelectedProject}
                  disabled={!selectedWorkspace}
                >
                  <SelectTrigger id="project">
                    <SelectValue placeholder={selectedWorkspace ? 'Select project' : 'Select workspace first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.length > 0 ? (
                      projects.map((proj) => (
                        <SelectItem key={proj.name} value={proj.name}>
                          <div className="flex items-center gap-2">
                            <span>{proj.name}</span>
                            {proj.isGitRepo && (
                              <span className="text-xs text-muted-foreground">
                                ({proj.defaultBranch ?? 'git'})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="_empty" disabled>
                        {selectedWorkspace ? 'No projects in workspace' : 'Select workspace first'}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || (!isTerminal && (!selectedWorkspace || !selectedProject))}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Session'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
