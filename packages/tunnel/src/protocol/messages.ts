/**
 * @file messages.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

// ============================================================================
// Workstation Messages
// ============================================================================

/**
 * Workstation → Tunnel: Registration request
 */
export interface WorkstationRegisterMessage {
  type: 'workstation.register';
  payload: {
    api_key: string;
    name: string;
    auth_key: string;
    reconnect?: boolean;
    previous_tunnel_id?: string;
  };
}

/**
 * Tunnel → Workstation: Registration success
 */
export interface WorkstationRegisteredMessage {
  type: 'workstation.registered';
  payload: {
    tunnel_id: string;
    public_url: string;
    restored?: boolean;
  };
}

// ============================================================================
// Mobile Client Messages
// ============================================================================

/**
 * Mobile → Tunnel: Connection request
 */
export interface ConnectMessage {
  type: 'connect';
  payload: {
    tunnel_id: string;
    auth_key: string;
    device_id: string;
    reconnect?: boolean;
  };
}

/**
 * Tunnel → Mobile: Connection success
 */
export interface ConnectedMessage {
  type: 'connected';
  payload: {
    tunnel_id: string;
    tunnel_version?: string; // Tunnel server version (semver)
    protocol_version?: string; // Protocol version (semver)
    restored?: boolean;
  };
}

// ============================================================================
// Heartbeat Messages
// ============================================================================

/**
 * Ping message for connection health monitoring
 */
export interface PingMessage {
  type: 'ping';
  timestamp: number;
}

/**
 * Pong message for connection health monitoring
 */
export interface PongMessage {
  type: 'pong';
  timestamp: number;
}

// ============================================================================
// Connection Events
// ============================================================================

/**
 * Tunnel → Mobile: Workstation went offline
 */
export interface WorkstationOfflineMessage {
  type: 'connection.workstation_offline';
  payload: {
    tunnel_id: string;
  };
}

/**
 * Tunnel → Mobile: Workstation came back online
 */
export interface WorkstationOnlineMessage {
  type: 'connection.workstation_online';
  payload: {
    tunnel_id: string;
  };
}

// ============================================================================
// Error Messages
// ============================================================================

export type ErrorCode =
  | 'INVALID_API_KEY'
  | 'INVALID_AUTH_KEY'
  | 'TUNNEL_NOT_FOUND'
  | 'WORKSTATION_OFFLINE'
  | 'REGISTRATION_FAILED'
  | 'INVALID_PAYLOAD'
  | 'INTERNAL_ERROR';

/**
 * Error response message
 */
export interface ErrorMessage {
  type: 'error';
  id?: string;
  payload: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * All incoming messages that the tunnel server can receive
 */
export type IncomingMessage =
  | WorkstationRegisterMessage
  | ConnectMessage
  | PingMessage;

/**
 * All outgoing messages that the tunnel server can send
 */
export type OutgoingMessage =
  | WorkstationRegisteredMessage
  | ConnectedMessage
  | PongMessage
  | WorkstationOfflineMessage
  | WorkstationOnlineMessage
  | ErrorMessage;

/**
 * Generic message structure for forwarding
 */
export interface ForwardedMessage {
  type: string;
  [key: string]: unknown;
}

// ============================================================================
// Targeted Forwarding Messages
// ============================================================================

/**
 * Workstation → Tunnel: Forward message to a specific device
 */
export interface ForwardToDeviceMessage {
  type: 'forward.to_device';
  device_id: string;
  payload: string;
}

/**
 * Tunnel → Workstation: Client disconnected notification
 * Sent when a mobile client disconnects so workstation can clean up subscriptions
 */
export interface ClientDisconnectedMessage {
  type: 'client.disconnected';
  payload: {
    device_id: string;
    tunnel_id: string;
  };
}

