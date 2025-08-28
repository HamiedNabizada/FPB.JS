import { is } from '../../help/utils';

/**
 * Smart SystemLimit resize handler that prevents unwanted auto-expansion
 * 
 * The problem: diagram-js automatically expands SystemLimit to fit all children
 * even when the user just clicks the resize handle without dragging.
 * 
 * This handler prevents auto-expansion by checking if the bounds actually changed
 * due to user intention vs automatic fitting.
 */
export default function SystemLimitSmartResizeHandler(eventBus) {

  // Track resize state
  let resizeState = new Map();

  // Intercept resize initialization to track original bounds
  eventBus.on('resize.init', 1400, (event) => {
    const { shape } = event.context;
    
    if (!is(shape, 'fpb:SystemLimit')) {
      return;
    }

    // console.log('🎯 SystemLimit resize init - storing original bounds');
    
    // Store original bounds before diagram-js modifies them
    resizeState.set(shape.id, {
      originalBounds: {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height
      },
      moveEventCount: 0,
      hasSignificantChange: false,
      resizeDirection: null,
      startMousePos: null,
      lastMousePos: null
    });
  });

  // Track resize move operations - check if user actually moved significantly
  eventBus.on('resize.move', (event) => {
    const { shape } = event.context;
    
    if (!is(shape, 'fpb:SystemLimit')) {
      return;
    }

    const state = resizeState.get(shape.id);
    if (state) {
      state.moveEventCount++;
      
      // Store current mouse position if available
      if (event.originalEvent && event.originalEvent.clientX !== undefined) {
        const currentX = event.originalEvent.clientX;
        const currentY = event.originalEvent.clientY;
        
        if (!state.startMousePos) {
          state.startMousePos = { x: currentX, y: currentY };
          // console.log('🎯 Recording start mouse position', { x: currentX, y: currentY });
        } else {
          const deltaX = currentX - state.startMousePos.x;
          const deltaY = currentY - state.startMousePos.y;
          const absDeltaX = Math.abs(deltaX);
          const absDeltaY = Math.abs(deltaY);
          
          // Determine primary resize direction
          if (absDeltaX > 15 || absDeltaY > 15) {
            if (!state.resizeDirection) {
              if (absDeltaX > absDeltaY * 2) {
                state.resizeDirection = 'horizontal';
                // console.log('🎯 Detected HORIZONTAL resize intention');
              } else if (absDeltaY > absDeltaX * 2) {
                state.resizeDirection = 'vertical';
                // console.log('🎯 Detected VERTICAL resize intention');
              } else {
                state.resizeDirection = 'both';
                // console.log('🎯 Detected DIAGONAL resize intention');
              }
            }
          }
          
          if (absDeltaX > 10 || absDeltaY > 10) {
            state.hasSignificantChange = true;
            // console.log('🎯 Significant mouse movement detected', { 
            //   deltaX, deltaY, moveCount: state.moveEventCount, 
            //   direction: state.resizeDirection 
            // });
          } else {
            // console.log('🎯 Minor mouse movement', { deltaX, deltaY, moveCount: state.moveEventCount });
          }
        }
      } else {
        // Fallback: If we get more than 3 move events, assume user is dragging
        if (state.moveEventCount > 3) {
          state.hasSignificantChange = true;
          // console.log('🎯 Multiple move events - assuming user drag', { moveCount: state.moveEventCount });
        } else {
          // console.log('🎯 Move event without mouse data', { moveCount: state.moveEventCount });
        }
      }
    }
  });

  // Intercept the resize command before execution
  eventBus.on('commandStack.shape.resize.preExecute', 1400, (event) => {
    const { context } = event;
    const { shape, newBounds } = context;
    
    if (!is(shape, 'fpb:SystemLimit')) {
      return;
    }

    const state = resizeState.get(shape.id);
    if (!state) {
      console.warn('🎯 No resize state found for SystemLimit');
      return;
    }

    const { originalBounds, hasSignificantChange, moveEventCount, resizeDirection } = state;

    // Check if this is auto-expansion vs user intention
    const boundsChanged = (
      newBounds.width !== originalBounds.width ||
      newBounds.height !== originalBounds.height ||
      newBounds.x !== originalBounds.x ||
      newBounds.y !== originalBounds.y
    );

    // Only allow changes if user made significant movement
    if (boundsChanged && !hasSignificantChange) {
      // Override with original bounds to prevent auto-expansion
      context.newBounds = {
        x: originalBounds.x,
        y: originalBounds.y,
        width: originalBounds.width,
        height: originalBounds.height
      };
    } else if (boundsChanged && hasSignificantChange) {
      // User made significant changes - but respect resize direction intention
      if (resizeDirection === 'horizontal') {
        // Keep original height and Y position for horizontal resize
        context.newBounds = {
          x: newBounds.x,
          y: originalBounds.y,
          width: newBounds.width,
          height: originalBounds.height
        };
      } else if (resizeDirection === 'vertical') {
        // Keep original width and X position for vertical resize
        context.newBounds = {
          x: originalBounds.x,
          y: newBounds.y,
          width: originalBounds.width,
          height: newBounds.height
        };
      }
    }
  });

  // Clean up resize state
  eventBus.on(['resize.end', 'resize.cleanup'], (event) => {
    const { shape } = event.context;
    
    if (!is(shape, 'fpb:SystemLimit')) {
      return;
    }

    // console.log('🧹 Cleaning up SystemLimit resize state');
    resizeState.delete(shape.id);
  });

  // Handle resize cancel
  eventBus.on('resize.cancel', (event) => {
    const { shape } = event.context;
    
    if (!is(shape, 'fpb:SystemLimit')) {
      return;
    }

    // console.log('🧹 SystemLimit resize cancelled - cleaning up state');
    resizeState.delete(shape.id);
  });
}

SystemLimitSmartResizeHandler.$inject = [
  'eventBus'
];