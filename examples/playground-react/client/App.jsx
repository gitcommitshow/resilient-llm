/**
 * Main App Entry Point
 * 
 * This file assembles all components into the main application.
 */
import { AppProvider } from './context';
import { PromptsSidebar, PromptHeader, SystemPrompt, MessageList, MessageInput, Header, Footer, SettingsDrawer, UndoNotification, BackendActivityPanel } from './components';

/**
 * Main App Component
 */
export default function App() {
    return (
        <AppProvider>
            <div className="chat-container">
                <Header />
                <div className="playground-main">
                    <PromptsSidebar />
                    <section className="chat-panel">
                        <PromptHeader />
                        <SystemPrompt />
                        <MessageList />
                        <MessageInput />
                    </section>
                </div>
                <Footer />
                <BackendActivityPanel />
                <SettingsDrawer />
                <UndoNotification />
            </div>
        </AppProvider>
    );
}

