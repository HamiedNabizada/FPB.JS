import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

const ThemeToggle = () => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        // Check localStorage for saved theme preference
        const savedTheme = localStorage.getItem('fpb-theme');
        if (savedTheme) {
            return savedTheme === 'dark';
        }
        // Check system preference
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        // Apply theme to document
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
        // Save preference to localStorage
        localStorage.setItem('fpb-theme', isDarkMode ? 'dark' : 'light');
        
        // Fix white flash during drag/drop in dark mode
        if (isDarkMode) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        const element = mutation.target;
                        const style = element.getAttribute('style');
                        if (style && (style.includes('fill: white') || style.includes('fill:#ffffff') || style.includes('background: white') || style.includes('background:#ffffff'))) {
                            // Override white backgrounds/fills in dark mode
                            element.style.setProperty('fill', '#2d2d2d', 'important');
                            element.style.setProperty('background', '#2d2d2d', 'important');
                        }
                    }
                });
            });
            
            // Watch for style changes on SVG elements
            const svgContainer = document.querySelector('.djs-container');
            if (svgContainer) {
                observer.observe(svgContainer, {
                    attributes: true,
                    attributeFilter: ['style'],
                    subtree: true
                });
            }
            
            return () => observer.disconnect();
        }
    }, [isDarkMode]);

    // Listen for system theme changes
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e) => {
            // Only update if no manual preference is saved
            if (!localStorage.getItem('fpb-theme')) {
                setIsDarkMode(e.matches);
            }
        };

        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    const toggleTheme = () => {
        setIsDarkMode(prev => !prev);
    };

    const tooltipText = isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    const icon = isDarkMode ? 'sun' : 'moon';

    return (
        <OverlayTrigger 
            placement="auto" 
            flip={true} 
            overlay={<Tooltip id="tooltip-theme">{tooltipText}</Tooltip>}
        >
            <Button 
                onClick={toggleTheme}
                variant="secondary-outline"
                aria-label={tooltipText}
            >
                <FontAwesomeIcon icon={icon} size="lg" />
            </Button>
        </OverlayTrigger>
    );
};

export default ThemeToggle;