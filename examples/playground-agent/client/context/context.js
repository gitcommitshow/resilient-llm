/**
 * App context and hook - separate from AppProvider so the provider file can Fast Refresh.
 */
import { createContext, useContext } from 'react';

export const AppContext = createContext(null);

/**
 * Hook to access app context
 */
export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
