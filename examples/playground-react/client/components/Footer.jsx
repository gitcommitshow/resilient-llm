/**
 * Footer Component - library info and links
 */
import { useState, useEffect } from 'react';
import { LIBRARY_INFO_URL } from '../utils';

export function Footer() {
    const [libraryVersion, setLibraryVersion] = useState('...');
    const [librarySource, setLibrarySource] = useState('npm');
    const [librarySourceLink, setLibrarySourceLink] = useState('https://www.npmjs.com/package/@gitcommitshow/resilient-llm');

    useEffect(() => {
        async function loadLibraryInfo() {
            try {
                const response = await fetch(LIBRARY_INFO_URL);
                const info = await response.json();
                setLibraryVersion(info.version);
                setLibrarySource(info.source);
                setLibrarySourceLink(info.sourcePath);
            } catch (error) {
                console.error('Error loading library info:', error);
                setLibraryVersion('unknown');
                setLibrarySource('error');
                setLibrarySourceLink('#');
            }
        }
        loadLibraryInfo();
    }, []);

    return (
        <div className="library-footer">
            <span className="library-footer-text">
                Made with <a href="https://github.com/gitcommitshow/resilient-llm" target="_blank" rel="noopener noreferrer" className="library-name-link">
                    <strong>ResilientLLM</strong>
                </a> <span id="libraryVersion">v{libraryVersion}</span>
                <a href={librarySourceLink} id="librarySourceLink" className={`library-source-link ${librarySource}`} target="_blank" rel="noopener noreferrer">
                    <span id="librarySource">{librarySource}</span>
                </a>
            </span>
        </div>
    );
}
