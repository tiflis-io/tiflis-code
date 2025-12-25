// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticating'
  | 'authenticated'
  | 'verified'
  | 'degraded'
  | 'error';

export interface Credentials {
  tunnelId: string;
  tunnelUrl: string;
  authKey: string;
  deviceId: string;
}

export interface WorkstationInfo {
  name: string;
  version: string;
  protocolVersion: string;
  workspacesRoot: string;
}

export interface TunnelInfo {
  version: string;
  protocolVersion: string;
}
