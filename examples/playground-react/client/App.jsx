/**
 * Main App Component
 */
import { AppProvider } from './context/AppContext';
import {
    PromptsSidebar,
    PromptHeader,
    SystemPrompt,
    MessageList,
    MessageInput,
    Header,
    Footer,
    SettingsDrawer,
    UndoNotification
} from './components';

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
                <SettingsDrawer />
                <UndoNotification />
            </div>
        </AppProvider>
    );
}
