/**
 * Electron Store
 * Detects and provides access to Electron API
 */

import { readable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Check if running in Electron
 */
export const isElectron = readable<boolean>(false, (set) => {
	if (browser) {
		const hasElectronAPI = !!(window as any).electronAPI;
		set(hasElectronAPI);
	}
});

/**
 * Get Electron API (safely)
 */
export function getElectronAPI() {
	if (browser && (window as any).electronAPI) {
		return (window as any).electronAPI;
	}
	return null;
}

/**
 * Electron API Types (for TypeScript)
 */
export interface ElectronAPI {
	// PTSL (Pro Tools) Integration
	ptsl: {
		connect: () => Promise<any>;
		disconnect: () => Promise<void>;
		getConnectionStatus: () => Promise<any>;
		createMarkersFromFile: (filePath: string, projectName: string) => Promise<any>;
	};

	// File Dialogs
	openFileDialog: (options?: {
		filters?: Array<{ name: string; extensions: string[] }>;
	}) => Promise<string | null>;

	selectFolderDialog: () => Promise<string | null>;

	// Folder Operations
	createFolder: (projectName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
}
