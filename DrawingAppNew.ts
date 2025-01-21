// @ts-nocheck

export class DrawingApp {
  constructor(initColors: any) {
    this.initColors = initColors;
    this.canvas = document.getElementById('drawing-canvas');
    console.log('canvas created', this.canvas);
    this.ctx = this.canvas.getContext('2d', {
      desynchronized: true,
      alpha: false
    });
    console.log('starting drawing app');

    // Create offscreen canvas for buffering
    this.offscreenCanvas = new OffscreenCanvas(100, 100);
    console.log('offscreen canvas created', this.offscreenCanvas);
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
      desynchronized: true,
      alpha: false
    });

    this.isDrawing = false;
    this.currentTool = 'pen';
    this.color = this.initColors.textColor;
    this.brushSizes = {
      small: 2,
      medium: 4,
      large: 8
    };
    this.brushSize = this.brushSizes.small; // Default size
    this.points = [];
    this.strokes = [];  // Active strokes
    this.redoStrokes = [];  // Strokes that were undone
    this.currentStroke = null;  // Current stroke being drawn
    this.lastDrawTime = 0;
    this.lastPoint = null;
    this.velocity = 0;
    this.lastStrokeTime = 0;
    this.strokeBuffer = [];
    this.strokeTimeout = 20;  // Reduced timeout for faster writing
    this.proximityThreshold = 10; // pixels distance to connect strokes
    this.dpr = window.devicePixelRatio || 1;
    this.smoothingFactor = 0.3; // Lower = smoother but more latency
    this.minDistance = 0.5 * this.dpr;  // Reduced to capture more points
    this.maxDistance = 40 * this.dpr;   // Max distance between points to prevent unwanted connections
    this.minPressureThreshold = 0.03; // Ignore very light touches (5% pressure)
    this.drawQueue = [];  // Add this line
    this.strokes = [];
    this.redoStrokes = [];
    this.currentStroke = null;
    this.lastTapTime = 0;
    this.tapCount = 0;
    this.twoFingerTapDelay = 300; // ms to detect two finger tap
    this.showGrid = true;

    // Viewport tracking
    this.viewportX = 0;
    this.viewportY = 0;
    this.isPanning = false;
    this.lastPanPoint = null;

    // For handling touch events
    this.touchPoints = new Map();

    this.scale = 1;
    this.initialDistance = 0;
    this.initialScale = 1;
    this.minScale = 0.5;
    this.maxScale = 5;

    this.isPanning = false;
    this.isZooming = false;
    this.initialDistance = 0;
    this.initialScale = 1;
    this.minScale = 0.5;
    this.maxScale = 5;
    this.gestureStarted = false;

    this.zoomCenterX = 0;
    this.zoomCenterY = 0;

    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.zIndex = '0';

    // Add larger eraser sizes
    this.eraserSizes = {
      small: 20,
      medium: 40,
      large: 60
    };

    // Add eraser preview element
    this.eraserPreview = document.getElementById('eraser-preview');
    this.eraserPreview.style.borderColor = this.initColors.textColor;

    // Add a separate canvas for active drawing
    this.activeCanvas = new OffscreenCanvas(100, 100);
    this.activeCtx = this.activeCanvas.getContext('2d', {
      desynchronized: true,
      alpha: true  // Enable alpha for erasing
    });

    // Add shape properties
    this.shapes = [];
    this.selectedShape = null;
    this.isDrawingShape = false;
    this.shapeStartPoint = null;

    // Add resize handles state
    this.resizeHandleSize = 8;
    this.activeHandle = null;

    this.initCanvas();
    this.initEvents();

    // Save initial blank state immediately
    this.strokes.push({
      points: [],
      tool: this.currentTool,
      color: this.color,
      brushSize: this.brushSize
    });

    this.loadState();
    this.startDrawLoop();
    this.initGrid();
  }

  initCanvas() {
    const resizeCanvas = () => {
      const container = document.getElementById('canvas-container');
      const dpr = window.devicePixelRatio || 1;
      this.dpr = dpr;

      // Set physical pixels
      this.canvas.width = container.clientWidth * dpr;
      this.canvas.height = container.clientHeight * dpr;

      // Set CSS pixels
      this.canvas.style.width = container.clientWidth + "px";
      this.canvas.style.height = container.clientHeight + "px";

      // Resize grid canvas if it exists
      if (this.gridCanvas) {
        this.gridCanvas.width = this.canvas.width;
        this.gridCanvas.height = this.canvas.height;
        this.gridCanvas.style.width = this.canvas.style.width;
        this.gridCanvas.style.height = this.canvas.style.height;
      }

      // Resize offscreen canvas to match
      this.offscreenCanvas.width = this.canvas.width;
      this.offscreenCanvas.height = this.canvas.height;

      this.redrawCanvas();
    };

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  initEvents() {
    // Tool selection
    document.querySelectorAll('.tool-button[data-tool]').forEach(button => {
      button.addEventListener('click', (e) => {
        document.querySelector('.tool-button.active').classList.remove('active');
        button.classList.add('active');
        this.currentTool = button.dataset.tool;

        // Hide eraser preview initially when selecting eraser
        this.eraserPreview.style.display = 'none';

        if (this.currentTool === 'eraser') {
          // Set eraser to largest size by default
          document.querySelectorAll('.tool-button[data-size]').forEach(btn =>
            btn.classList.remove('active')
          );
          document.querySelector('.tool-button[data-size="large"]').classList.add('active');
          this.brushSize = this.eraserSizes.large;
          this.updateEraserPreview();
        } else {
          // Reset to small size for pen
          document.querySelectorAll('.tool-button[data-size]').forEach(btn =>
            btn.classList.remove('active')
          );
          document.querySelector('.tool-button[data-size="small"]').classList.add('active');
          this.brushSize = this.brushSizes.small;
        }
      });
    });

    // Color picker
    document.getElementById('color-picker').addEventListener('input', (e) => {
      this.color = e.target.value;
      console.log('color changed', this.color);
    });

    // Replace brush size slider with buttons
    document.querySelectorAll('.tool-button[data-size]').forEach(button => {
      button.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-button[data-size]').forEach(btn =>
          btn.classList.remove('active')
        );
        button.classList.add('active');
        // Set brush size based on tool
        this.brushSize = this.currentTool === 'eraser' ?
          this.eraserSizes[button.dataset.size] :
          this.brushSizes[button.dataset.size];

        if (this.currentTool === 'eraser') {
          this.updateEraserPreview();
        }
      });
    });

    // Clear, Undo, Redo
    document.getElementById('clear').addEventListener('click', () => this.clearCanvas());
    document.getElementById('undo').addEventListener('click', () => this.undo());
    document.getElementById('redo').addEventListener('click', () => this.redo());

    // Drawing events
    this.canvas.addEventListener('pointermove', this.draw.bind(this), { passive: true });
    this.canvas.addEventListener('pointerdown', this.startDrawing.bind(this), { passive: true });
    this.canvas.addEventListener('pointerup', this.endDrawing.bind(this), { passive: true });
    this.canvas.addEventListener('pointerout', this.endDrawing.bind(this), { passive: true });

    // Add touch event handlers for two-finger tap
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const now = performance.now();

        // Check if this is a quick tap (not a long press or drag)
        if (now - this.lastTapTime < this.twoFingerTapDelay) {
          this.undo();
        }

        this.lastTapTime = now;
      }
    }, { passive: false });

    // Prevent default touch actions
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length === 0 && e.changedTouches.length === 2) {
        e.preventDefault();
      }
    }, { passive: false });

    // Add touch event handlers
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        this.isDrawing = false;

        // Only determine gesture type if we haven't started one yet
        if (!this.gestureStarted) {
          const initialDistance = this.getDistance(e.touches[0], e.touches[1]);
          this.initialDistance = initialDistance;
          this.initialScale = this.scale;
          this.lastPanPoint = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
          };
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();

        const currentMidpoint = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };

        // If we haven't determined the gesture type yet, do it on first movement
        if (!this.gestureStarted) {
          const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
          const distanceDelta = Math.abs(currentDistance - this.initialDistance);

          // Calculate movement of midpoint
          const midpointMove = Math.abs(currentMidpoint.x - this.lastPanPoint.x) +
            Math.abs(currentMidpoint.y - this.lastPanPoint.y);

          if (distanceDelta > 18) {
            this.isZooming = true;
            this.initialDistance = currentDistance;
            this.initialScale = this.scale;
          } else if (midpointMove > 8) {
            this.isPanning = true;
          } else {
            return;
          }
          this.gestureStarted = true;
        }

        if (this.isZooming) {
          const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
          let newScale = (currentDistance / this.initialDistance) * this.initialScale;
          newScale = Math.min(Math.max(newScale, this.minScale), this.maxScale);

          // Get the current zoom point in canvas coordinates
          const rect = this.canvas.getBoundingClientRect();
          const zoomX = (currentMidpoint.x - rect.left) * this.dpr;
          const zoomY = (currentMidpoint.y - rect.top) * this.dpr;

          // Convert to world coordinates (before scale change)
          const worldX = (zoomX + this.viewportX) / this.scale;
          const worldY = (zoomY + this.viewportY) / this.scale;

          // Update scale
          this.scale = newScale;

          // Calculate new viewport position to maintain zoom point
          this.viewportX = (worldX * this.scale) - zoomX;
          this.viewportY = (worldY * this.scale) - zoomY;

        } else if (this.isPanning) {
          if (this.lastPanPoint) {
            const dx = (currentMidpoint.x - this.lastPanPoint.x) * this.dpr;
            const dy = (currentMidpoint.y - this.lastPanPoint.y) * this.dpr;
            this.viewportX -= dx;
            this.viewportY -= dy;
          }
          this.lastPanPoint = currentMidpoint;
        }

        // Update grid and redraw for both pan and zoom
        this.updateGridTransform();
        this.redrawCanvas();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        this.isPanning = false;
        this.isZooming = false;
        this.gestureStarted = false;
        this.lastPanPoint = null;
        this.initialDistance = 0;
        this.zoomCenterX = 0;
        this.zoomCenterY = 0;
      }
    });

    // Update eraser preview movement to show only when hovering over canvas
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.currentTool === 'eraser') {
        const size = this.brushSize / this.dpr;
        const rect = this.canvas.getBoundingClientRect();
        const toolbarHeight = 60; // Height of the toolbar
        
        // Calculate position relative to the canvas
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top + toolbarHeight;
        
        this.eraserPreview.style.display = 'block';
        this.eraserPreview.style.width = size + 'px';
        this.eraserPreview.style.height = size + 'px';
        this.eraserPreview.style.zIndex = '9999';
        this.eraserPreview.style.position = 'absolute'; // Changed to absolute
        
        // Position relative to canvas
        this.eraserPreview.style.left = (x - size/2) + "px";
        this.eraserPreview.style.top = (y - size/2) + "px";
        
        this.eraserPreview.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        this.eraserPreview.style.border = `2px solid ${this.initColors.textColor}`;
        this.eraserPreview.style.borderRadius = '50%';
      }
    });

    this.canvas.addEventListener('pointerleave', (e) => {
      this.eraserPreview.style.display = 'none';
    });

    // Add shape-specific event handlers
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.currentTool === 'rectangle') {
        const point = {
          x: (e.offsetX * this.dpr + this.viewportX) / this.scale,
          y: (e.offsetY * this.dpr + this.viewportY) / this.scale
        };

        this.lastPoint = point;

        // First check if we're clicking a resize handle
        if (this.selectedShape) {
          this.checkResizeHandles(point);
          if (this.activeHandle) {
            e.preventDefault();
            return; // Exit early if we clicked a handle
          }
        }

        // Then check for shape selection
        const clickedShape = this.getShapeAtPoint(point);
        if (clickedShape) {
          this.selectedShape = clickedShape;
          this.checkResizeHandles(point);
        } else {
          this.isDrawingShape = true;
          this.shapeStartPoint = point;
          this.selectedShape = null;
        }
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.currentTool === 'rectangle') {
        const point = {
          x: (e.offsetX * this.dpr + this.viewportX) / this.scale,
          y: (e.offsetY * this.dpr + this.viewportY) / this.scale
        };

        // Update lastPoint
        this.lastPoint = point;

        if (this.isDrawingShape && this.shapeStartPoint) {
          // Drawing new shape
          this.redrawCanvas();
          // Draw temporary shape while dragging
          const width = point.x - this.shapeStartPoint.x;
          const height = point.y - this.shapeStartPoint.y;
          const tempShape = {
            x: width < 0 ? point.x : this.shapeStartPoint.x,
            y: height < 0 ? point.y : this.shapeStartPoint.y,
            width: Math.abs(width),
            height: Math.abs(height),
            color: this.color
          };
          this.drawShape(tempShape);
        } else if (this.selectedShape && this.activeHandle) {
          // Resizing shape
          this.resizeShape(this.selectedShape, this.activeHandle, point);
          this.redrawCanvas();
        }
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.currentTool === 'rectangle' && this.isDrawingShape) {
        this.isDrawingShape = false;
        if (this.shapeStartPoint && this.lastPoint) {
          const width = this.lastPoint.x - this.shapeStartPoint.x;
          const height = this.lastPoint.y - this.shapeStartPoint.y;
          const shape = {
            type: 'rectangle',
            x: width < 0 ? this.lastPoint.x : this.shapeStartPoint.x,
            y: height < 0 ? this.lastPoint.y : this.shapeStartPoint.y,
            width: Math.abs(width),
            height: Math.abs(height),
            color: this.color
          };
          this.shapes.push(shape);
          this.selectedShape = shape;
          this.redrawCanvas();
        }
        this.shapeStartPoint = null;
      }
      this.activeHandle = null;
    });
  }

  startDrawing(e) {
    if (e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Only start drawing if we're using pen or eraser
    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      this.isDrawing = true;
      this.currentStroke = {
        points: [],
        tool: this.currentTool,
        color: this.color,
        brushSize: this.brushSize
      };

      // Add initial point for eraser
      if (this.currentTool === 'eraser') {
        const point = {
          x: (e.offsetX * this.dpr + this.viewportX) / this.scale,
          y: (e.offsetY * this.dpr + this.viewportY) / this.scale,
          pressure: e.pressure || 1,
          time: performance.now()
        };
        this.currentStroke.points.push(point);
        this.lastPoint = point;
      }
    }
  }

  draw(e) {
    // Only handle drawing for pen/eraser
    if (!this.isDrawing || this.isPanning ||
      (this.currentTool !== 'pen' && this.currentTool !== 'eraser')) return;

    const point = {
      x: (e.offsetX * this.dpr + this.viewportX) / this.scale,
      y: (e.offsetY * this.dpr + this.viewportY) / this.scale,
      pressure: e.pressure || 1,
      time: performance.now()
    };

    if (this.currentStroke) {
      // Apply smoothing
      if (this.lastPoint) {
        point.x = this.lastPoint.x + (point.x - this.lastPoint.x) * this.smoothingFactor;
        point.y = this.lastPoint.y + (point.y - this.lastPoint.y) * this.smoothingFactor;
      }

      this.currentStroke.points.push(point);

      if (this.currentStroke.points.length >= 2) {
        const points = this.currentStroke.points;
        const p1 = points[points.length - 2];
        const p2 = points[points.length - 1];

        // Apply viewport transform before drawing
        this.ctx.save();
        this.ctx.translate(-this.viewportX, -this.viewportY);
        this.ctx.scale(this.scale, this.scale);

        this.ctx.beginPath();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        if (this.currentTool === 'eraser') {
          this.ctx.globalCompositeOperation = 'source-over';
          this.ctx.strokeStyle = this.initColors.backgroundPrimary;
        } else {
          this.ctx.globalCompositeOperation = 'source-over';
          this.ctx.strokeStyle = this.color;
        }

        const baseWidth = this.brushSize * 0.6;
        const pressureWidth = this.brushSize * 1.2;
        const pressure = p2.pressure;

        this.ctx.lineWidth = baseWidth + (pressureWidth * pressure);

        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();

        this.ctx.restore();
      }
    }

    this.lastPoint = point;
  }

  endDrawing() {
    // Only handle drawing for pen/eraser
    if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
      if (!this.isDrawing) return;

      if (this.currentStroke && this.currentStroke.points.length > 0) {
        this.strokes.push(this.currentStroke);
        this.redoStrokes = [];  // Clear redo stack
        this.saveToLocalStorage();
      }

      this.isDrawing = false;
      this.currentStroke = null;
      this.lastPoint = null;
    }
  }

  clearCanvas() {
    // Fill with background color instead of clearing
    this.ctx.fillStyle = this.initColors.backgroundPrimary;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.strokes = [];
    this.redoStrokes = [];
    this.saveToLocalStorage();
  }

  saveState() {
    // Don't save duplicate states
    const currentState = this.canvas.toDataURL();
    const lastState = this.strokes[this.strokes.length - 1];

    if (currentState !== lastState) {
      this.strokes.push(currentState);
      this.redoStrokes = [];
      // Limit the size of strokes to prevent memory issues
      if (this.strokes.length > 50) {
        this.strokes.shift();
      }
      this.saveToLocalStorage();
    }
  }

  undo() {
    if (this.strokes.length > 0) {
      const stroke = this.strokes.pop();
      this.redoStrokes.push(stroke);
      this.redrawCanvas();
      this.saveToLocalStorage();
    }
  }

  redo() {
    if (this.redoStrokes.length > 0) {
      const stroke = this.redoStrokes.pop();
      this.strokes.push(stroke);
      this.drawStroke(stroke);
      this.saveToLocalStorage();
    }
  }

  loadState() {
    const saved = localStorage.getItem('canvasStrokes');
    if (saved) {
      const data = JSON.parse(saved);
      this.strokes = data.strokes || [];
      this.shapes = data.shapes || [];
      this.redoStrokes = data.redoStrokes || [];
      this.redrawCanvas();
    }
  }

  saveToLocalStorage() {
    localStorage.setItem('canvasStrokes', JSON.stringify({
      strokes: this.strokes,
      shapes: this.shapes,
      redoStrokes: this.redoStrokes
    }));
  }

  redrawCanvas() {
    // Clear to white background
    console.log('redrawing canvas', this.initColors);
    this.ctx.fillStyle = this.initColors.backgroundPrimary;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply transforms
    this.ctx.save();
    this.ctx.translate(-this.viewportX, -this.viewportY);
    this.ctx.scale(this.scale, this.scale);

    // Draw all strokes first
    for (const stroke of this.strokes) {
      this.drawStroke(stroke);
    }

    // Then draw all shapes on top
    this.shapes.forEach(shape => {
      this.drawShape(shape);
      if (shape === this.selectedShape) {
        this.drawSelectionHandles(shape);
      }
    });

    this.ctx.restore();

    // Update grid after canvas redraw
    this.updateGridTransform();
  }

  calculateVelocity(point) {
    if (!this.lastPoint || !this.lastDrawTime) {
      this.lastPoint = point;
      this.lastDrawTime = performance.now();
      return 0;
    }

    const dx = point.x - this.lastPoint.x;
    const dy = point.y - this.lastPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const timeElapsed = performance.now() - this.lastDrawTime;

    this.lastDrawTime = performance.now();

    return distance / timeElapsed; // pixels per millisecond
  }

  drawStroke(stroke) {
    const points = stroke.points;
    if (points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = this.initColors.backgroundPrimary;
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = stroke.color;
    }

    const strokeWidth = stroke.brushSize * 0.85;
    this.ctx.lineWidth = strokeWidth / this.scale;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      if (i === 0) {
        this.ctx.moveTo(p1.x, p1.y);
      }
      this.ctx.lineTo(p2.x, p2.y);
    }

    this.ctx.stroke();

    // Reset composite operation
    this.ctx.globalCompositeOperation = 'source-over';
  }

  startDrawLoop() {
    const drawLoop = () => {
      requestAnimationFrame(drawLoop);
    };
    requestAnimationFrame(drawLoop);
  }

  initGrid() {
    const gridToggle = document.getElementById('grid-toggle');
    const container = document.getElementById('canvas-container');

    // Create grid canvas
    this.gridCanvas = document.createElement('canvas');
    this.gridCanvas.style.position = 'absolute';
    this.gridCanvas.style.top = '0';
    this.gridCanvas.style.left = '0';
    this.gridCanvas.style.pointerEvents = 'none';
    this.gridCanvas.style.zIndex = '1';  // Add z-index
    container.appendChild(this.gridCanvas);
    this.gridCtx = this.gridCanvas.getContext('2d', { alpha: true });  // Enable alpha

    this.gridCanvas.width = this.canvas.width;
    this.gridCanvas.height = this.canvas.height;
    this.gridCanvas.style.width = this.canvas.style.width;
    this.gridCanvas.style.height = this.canvas.style.height;

    // Set initial grid state
    this.showGrid = true;
    gridToggle.classList.add('active');

    gridToggle.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      gridToggle.classList.toggle('active');
      this.updateGridTransform();
    });

    // Initial draw
    this.updateGridTransform();
  }

  updateGridTransform() {
    if (!this.showGrid || !this.gridCtx) {
      return;
    }

    // Clear the grid canvas
    this.gridCtx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

    // Apply the same transforms as the main canvas
    this.gridCtx.save();
    this.gridCtx.translate(-this.viewportX, -this.viewportY);
    this.gridCtx.scale(this.scale, this.scale);

    // Draw grid with larger base size
    const gridSize = 40;  // Increased from 20 to 40
    const width = this.gridCanvas.width / this.scale + gridSize;
    const height = this.gridCanvas.height / this.scale + gridSize;

    this.gridCtx.beginPath();
    this.gridCtx.strokeStyle = this.initColors.dividerColor;
    this.gridCtx.lineWidth = 1 / this.scale;

    // Adjust starting positions to ensure full coverage
    const startX = Math.floor(this.viewportX / (gridSize * this.scale)) * gridSize;
    const startY = Math.floor(this.viewportY / (gridSize * this.scale)) * gridSize;

    // Draw vertical lines
    for (let x = startX; x <= startX + width; x += gridSize) {
      this.gridCtx.moveTo(x, startY);
      this.gridCtx.lineTo(x, startY + height);
    }

    // Draw horizontal lines
    for (let y = startY; y <= startY + height; y += gridSize) {
      this.gridCtx.moveTo(startX, y);
      this.gridCtx.lineTo(startX + width, y);
    }

    this.gridCtx.stroke();
    this.gridCtx.restore();
  }

  initPanning() {
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();

      // Store touch points
      Array.from(e.touches).forEach(touch => {
        this.touchPoints.set(touch.identifier, {
          x: touch.clientX,
          y: touch.clientY
        });
      });

      // Two finger touch initiates panning
      if (e.touches.length === 2) {
        this.isPanning = true;
        this.isDrawing = false; // Stop drawing if we were
        this.lastPanPoint = this.getMidpoint(e.touches[0], e.touches[1]);
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();

      if (this.isPanning && e.touches.length === 2) {
        const currentMidpoint = this.getMidpoint(e.touches[0], e.touches[1]);

        if (this.lastPanPoint) {
          const dx = currentMidpoint.x - this.lastPanPoint.x;
          const dy = currentMidpoint.y - this.lastPanPoint.y;

          this.viewportX += dx;
          this.viewportY += dy;

          this.redrawCanvas();
        }

        this.lastPanPoint = currentMidpoint;
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      // Remove ended touch points
      Array.from(e.changedTouches).forEach(touch => {
        this.touchPoints.delete(touch.identifier);
      });

      if (e.touches.length < 2) {
        this.isPanning = false;
        this.lastPanPoint = null;
      }
    });
  }

  getMidpoint(touch1, touch2) {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  }

  getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Add new method for updating eraser preview
  updateEraserPreview() {
    const size = this.brushSize / this.dpr;
    this.eraserPreview.style.width = size + "px";
    this.eraserPreview.style.height = size + "px";
    this.eraserPreview.style.transform = 'none';
    this.eraserPreview.style.zIndex = '9999';
    this.eraserPreview.style.position = 'absolute'; // Changed to absolute
    this.eraserPreview.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    this.eraserPreview.style.border = `2px solid ${this.initColors.textColor}`;
    this.eraserPreview.style.borderRadius = '50%';
  }

  eraseArea(p1, p2, radius) {
    console.log('Erasing area', p1, p2, radius); // Debug log
    let modified = false;

    // Draw all strokes except the ones being erased
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const stroke = this.strokes[i];
      if (!stroke.erased && stroke.points && stroke.points.length > 0) {
        // Check if stroke intersects with eraser path
        if (this.strokeIntersectsEraser(stroke, p1, p2, radius)) {
          console.log('Found intersecting stroke', i); // Debug log
          // Split the stroke at the intersection points
          const newStrokes = this.splitStroke(stroke, p1, p2, radius);
          if (newStrokes.length > 0) {
            // Remove the original stroke and add the new segments
            this.strokes.splice(i, 1);
            this.strokes.push(...newStrokes);
            modified = true;
          } else {
            // If no new strokes, just mark this one as erased
            stroke.erased = true;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      // Only redraw if we actually modified something
      this.redrawCanvas();
    }
  }

  strokeIntersectsEraser(stroke, p1, p2, radius) {
    if (!stroke.points) return false;

    for (let i = 0; i < stroke.points.length; i++) {
      const point = stroke.points[i];
      // Check if point is within radius of eraser line
      const dist = this.pointToLineDistance(point, p1, p2);
      if (dist < radius) {
        return true;
      }
    }
    return false;
  }

  splitStroke(stroke, p1, p2, radius) {
    const newStrokes = [];
    let currentStroke = {
      points: [],
      tool: stroke.tool,
      color: stroke.color,
      brushSize: stroke.brushSize
    };

    for (const point of stroke.points) {
      // Check if point is within eraser radius
      const dist = this.pointToLineDistance(point, p1, p2);
      if (dist > radius) {
        if (currentStroke.points.length === 0) {
          currentStroke.points.push(point);
        } else {
          currentStroke.points.push(point);
        }
      } else if (currentStroke.points.length > 0) {
        newStrokes.push(currentStroke);
        currentStroke = {
          points: [],
          tool: stroke.tool,
          color: stroke.color,
          brushSize: stroke.brushSize
        };
      }
    }

    if (currentStroke.points.length > 0) {
      newStrokes.push(currentStroke);
    }

    return newStrokes;
  }

  pointToLineDistance(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  lineSegmentDistance(l1p1, l1p2, l2p1, l2p2) {
    // Returns minimum distance between two line segments
    const distances = [
      this.pointToLineDistance(l1p1, l2p1, l2p2),
      this.pointToLineDistance(l1p2, l2p1, l2p2),
      this.pointToLineDistance(l2p1, l1p1, l1p2),
      this.pointToLineDistance(l2p2, l1p1, l1p2)
    ];
    return Math.min(...distances);
  }

  drawShape(shape) {
    this.ctx.save();
    this.ctx.strokeStyle = shape.color;
    this.ctx.lineWidth = 2 / this.scale;
    this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    this.ctx.restore();
  }

  drawSelectionHandles(shape) {
    const handles = this.getResizeHandles(shape);
    this.ctx.save();
    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1 / this.scale;

    handles.forEach(handle => {
      this.ctx.beginPath();
      // Make handles visually larger
      const handleSize = this.resizeHandleSize * 1.5 / this.scale;
      this.ctx.rect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
      this.ctx.fill();
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  getResizeHandles(shape) {
    return [
      { x: shape.x, y: shape.y, cursor: 'nw-resize', position: 'nw' },
      { x: shape.x + shape.width, y: shape.y, cursor: 'ne-resize', position: 'ne' },
      { x: shape.x, y: shape.y + shape.height, cursor: 'sw-resize', position: 'sw' },
      { x: shape.x + shape.width, y: shape.y + shape.height, cursor: 'se-resize', position: 'se' }
    ];
  }

  getShapeAtPoint(point) {
    return this.shapes.find(shape =>
      point.x >= shape.x &&
      point.x <= shape.x + shape.width &&
      point.y >= shape.y &&
      point.y <= shape.y + shape.height
    );
  }

  checkResizeHandles(point) {
    if (!this.selectedShape) return null;

    const handles = this.getResizeHandles(this.selectedShape);
    for (const handle of handles) {
      if (this.pointInHandle(point, handle)) {
        this.activeHandle = handle.position;
        return;
      }
    }
    this.activeHandle = null;
  }

  pointInHandle(point, handle) {
    // Increase the hit area for handles
    const halfSize = (this.resizeHandleSize * 2) / this.scale;
    return (
      point.x >= handle.x - halfSize &&
      point.x <= handle.x + halfSize &&
      point.y >= handle.y - halfSize &&
      point.y <= handle.y + halfSize
    );
  }

  resizeShape(shape, handle, point) {
    const originalX = shape.x;
    const originalY = shape.y;
    const originalWidth = shape.width;
    const originalHeight = shape.height;

    switch (handle) {
      case 'nw':
        shape.width = originalWidth + (originalX - point.x);
        shape.height = originalHeight + (originalY - point.y);
        shape.x = point.x;
        shape.y = point.y;
        break;
      case 'ne':
        shape.width = point.x - shape.x;
        shape.height = originalHeight + (originalY - point.y);
        shape.y = point.y;
        break;
      case 'sw':
        shape.width = originalWidth + (originalX - point.x);
        shape.height = point.y - shape.y;
        shape.x = point.x;
        break;
      case 'se':
        shape.width = point.x - shape.x;
        shape.height = point.y - shape.y;
        break;
    }
  }
}