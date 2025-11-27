
// Mock Firebase configuration for demo/development environment
// This bypasses the need for actual Firebase credentials and dependencies
// allowing the app to run with local storage simulation.

export const auth = {
  currentUser: null as ({ getIdToken: () => Promise<string>, uid: string, email: string } | null)
}; 
export const db = {};
