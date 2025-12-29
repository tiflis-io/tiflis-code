// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

export type MessageRole = 'user' | 'assistant' | 'system';

export type SendStatus = 'pending' | 'sent' | 'failed';

export type ContentBlockType =
  | 'text'
  | 'code'
  | 'tool'
  | 'thinking'
  | 'status'
  | 'error'
  | 'cancel'
  | 'voice_input'
  | 'voice_output'
  | 'action_buttons';

export type ToolStatus = 'running' | 'completed' | 'failed';

export interface ContentBlock {
  id: string;
  blockType: ContentBlockType;
  content: string;
  metadata?: ContentBlockMetadata;
}

export interface ContentBlockMetadata {
  language?: string;
  toolName?: string;
  toolUseId?: string;
  toolInput?: string;
  toolOutput?: string;
  toolStatus?: ToolStatus;
  audioUrl?: string;
  audioBase64?: string;
  messageId?: string;
  duration?: number;
  hasAudio?: boolean;
  buttons?: ActionButton[];
  errorCode?: string;
}

export interface ActionButton {
  id: string;
  title: string;
  icon?: string;
  style: 'primary' | 'secondary' | 'destructive';
  action: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  contentBlocks: ContentBlock[];
  isStreaming: boolean;
  createdAt: Date;
  sendStatus?: SendStatus;
  fromDeviceId?: string;
}
