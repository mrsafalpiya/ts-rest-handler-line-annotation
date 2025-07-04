/**
 * Core types for ts-rest route annotation extension
 */
import * as vscode from 'vscode';

/**
 * Configuration for route annotations
 */
export interface AnnotationConfig {
  enabled: boolean;
  showHttpMethod: boolean;
  showPath: boolean;
  showSummary: boolean;
  annotationPrefix: string;
}

/**
 * Information about a route contract
 */
export interface RouteInfo {
  method: string;
  path: string;
  summary?: string;
  fullPath: string;
}

/**
 * Position and metadata for a @TsRestHandler decorator
 */
export interface HandlerDecoratorInfo {
  position: vscode.Position;
  line: number;
  contractReference: string;
  contractPropertyPath: string[];
  range: vscode.Range;
}

/**
 * Contract definition structure from ts-rest
 */
export interface ContractDefinition {
  method?: string;
  path?: string;
  summary?: string;
  description?: string;
  responses?: Record<string, any>;
  body?: any;
  query?: any;
  params?: any;
}

/**
 * Router definition with pathPrefix
 */
export interface RouterDefinition {
  pathPrefix?: string;
  [key: string]: any;
}

/**
 * Parsed contract file information
 */
export interface ContractFile {
  filePath: string;
  exports: Map<string, any>;
  lastModified: number;
}

/**
 * Cache entry for route information
 */
export interface CacheEntry {
  routeInfo: RouteInfo;
  timestamp: number;
  fileVersion: number;
}

/**
 * Import resolution result
 */
export interface ImportResolution {
  filePath: string;
  exportName?: string;
  isDefaultImport: boolean;
}

/**
 * AST parsing result
 */
export interface ParseResult {
  decorators: HandlerDecoratorInfo[];
  imports: Map<string, ImportResolution>;
  errors: string[];
}

/**
 * Extension state management
 */
export interface ExtensionState {
  isEnabled: boolean;
  contractCache: Map<string, ContractFile>;
  routeCache: Map<string, CacheEntry>;
  decorationTypes: Map<string, vscode.TextEditorDecorationType>;
  fileWatchers: Map<string, vscode.FileSystemWatcher>;
  disposables: vscode.Disposable[];
}

/**
 * Decoration rendering options
 */
export interface DecorationOptions {
  range: vscode.Range;
  renderOptions: {
    after: {
      contentText: string;
      color?: string | vscode.ThemeColor;
      fontStyle?: string;
      opacity?: string;
    };
  };
}

/**
 * Configuration change event
 */
export interface ConfigurationChange {
  enabled?: boolean;
  showHttpMethod?: boolean;
  showPath?: boolean;
  showSummary?: boolean;
  annotationPrefix?: string;
}

/**
 * Error types for better error handling
 */
export enum ErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PARSE_ERROR = 'PARSE_ERROR',
  IMPORT_RESOLUTION_FAILED = 'IMPORT_RESOLUTION_FAILED',
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  INVALID_DECORATOR = 'INVALID_DECORATOR',
  TYPESCRIPT_ERROR = 'TYPESCRIPT_ERROR'
}

/**
 * Extension error with type information
 */
export class ExtensionError extends Error {
  constructor(
    message: string,
    public readonly type: ErrorType,
    public readonly filePath?: string,
    public readonly position?: vscode.Position
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

/**
 * Utility type for promise resolution
 */
export type PromiseResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: ExtensionError;
};

/**
 * File system utilities
 */
export interface FileSystemUtils {
  exists(filePath: string): Promise<boolean>;
  readFile(filePath: string): Promise<string>;
  resolveModule(importPath: string, fromFile: string): Promise<string | null>;
  watchFile(filePath: string, callback: () => void): vscode.FileSystemWatcher;
}

/**
 * Performance metrics for debugging
 */
export interface PerformanceMetrics {
  parseTime: number;
  contractResolutionTime: number;
  decorationRenderTime: number;
  totalTime: number;
  cacheHits: number;
  cacheMisses: number;
}
