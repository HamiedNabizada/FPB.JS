import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from 'react-bootstrap/Button';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

/**
 * Light or dark, chosen by the user; the choice is kept by fpbTheme. When the
 * host decides the theme (option, setTheme or data-theme on its page), the
 * toggle is not shown (016c T5).
 */
const ThemeToggle = ({ modeler }) => {
    const theme = modeler.get('fpbTheme');
    const [current, setCurrent] = useState(() => theme.get());
    const [hostControlled, setHostControlled] = useState(() => theme.isHostControlled());

    useEffect(() => {
        const update = () => {
            setCurrent(theme.get());
            setHostControlled(theme.isHostControlled());
        };
        modeler.on('theme.changed', update);
        return () => modeler.off('theme.changed', update);
    }, [modeler, theme]);

    if (hostControlled) {
        return null;
    }

    const isDarkMode = current === 'dark';
    const tooltipText = isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    const icon = isDarkMode ? 'sun' : 'moon';

    return (
        <OverlayTrigger 
            placement="auto" 
            flip={true} 
            overlay={<Tooltip id="tooltip-theme">{tooltipText}</Tooltip>}
        >
            <Button 
                onClick={() => theme.choose(isDarkMode ? 'light' : 'dark')}
                variant="secondary-outline"
                aria-label={tooltipText}
            >
                <FontAwesomeIcon icon={icon} size="lg" />
            </Button>
        </OverlayTrigger>
    );
};

export default ThemeToggle;
