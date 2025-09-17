import { is } from '../../help/utils';

/**
 * Blocks drop feedback for SystemLimit in Dark Mode
 * 
 * diagram-js automatically adds visual feedback (white background) when dropping
 * elements onto containers. This blocks that feedback specifically for SystemLimit
 * to prevent the white flash in dark mode.
 */
export default function SystemLimitDropFeedbackBlocker(eventBus) {

  function isDarkMode() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  // Block drop feedback events for SystemLimit
  eventBus.on([
    'canvas.viewbox.changing',
    'canvas.viewbox.changed',
    'shape.changed',
    'connection.changed'
  ], 10000, function(event) { // Very high priority
    
    if (!isDarkMode()) {
      return; // Only interfere in dark mode
    }

    // Check if the event involves SystemLimit
    const element = event.element;
    if (element && is(element, 'fpb:SystemLimit')) {
      
      // Find the visual element and force it to stay transparent
      setTimeout(() => {
        const gfx = event.gfx || document.querySelector(`g[data-element-id="${element.id}"]`);
        if (gfx) {
          const rects = gfx.querySelectorAll('rect');
          rects.forEach(rect => {
            if (rect.getAttribute('fill') !== 'none') {
              rect.setAttribute('fill', 'none');
              rect.style.fill = 'none';
              rect.style.background = 'transparent';
            }
          });
        }
      }, 0);
    }
  });

  // More aggressive approach - override any style changes to SystemLimit
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      if (!isDarkMode()) return;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'fill' || mutation.attributeName === 'style')) {
          
          const element = mutation.target;
          
          // Check if this is within a SystemLimit group
          const systemLimitGroup = element.closest('g[data-element-id*="SystemLimit"]');
          if (systemLimitGroup && element.tagName === 'rect') {
            
            // Force SystemLimit rects to stay transparent
            if (element.getAttribute('fill') !== 'none') {
              element.setAttribute('fill', 'none');
              element.style.setProperty('fill', 'none', 'important');
              element.style.setProperty('background', 'transparent', 'important');
            }
          }
        }
      });
    });

    // Start observing once canvas is ready
    eventBus.on('canvas.init', () => {
      setTimeout(() => {
        const canvas = document.querySelector('.djs-container');
        if (canvas) {
          observer.observe(canvas, {
            attributes: true,
            attributeFilter: ['fill', 'style'],
            subtree: true
          });
        }
      }, 100);
    });
  }
}

SystemLimitDropFeedbackBlocker.$inject = [
  'eventBus'
];