type BrushSize = 'small' | 'medium' | 'large';

export class DrawingApp {
    // Core canvas contexts
    private ctx: CanvasRenderingContext2D;
    private gridCanvas!: HTMLCanvasElement;
    private gridCtx!: CanvasRenderingContext2D;
    private offscreenCanvas: OffscreenCanvas;
    private offscreenCtx: OffscreenCanvasRenderingContext2D;
    private activeCanvas: OffscreenCanvas;
    private activeCtx: OffscreenCanvasRenderingContext2D;
    private eraserPreview: HTMLDivElement;

    // Drawing state
    private isDrawing = false;
    private currentTool = 'pen';
    private color = '#000000';
    private brushSizes = { small: 2, medium: 4, large: 8 };
    private eraserSizes = { small: 20, medium: 40, large: 60 };
    private brushSize: number;
    private strokes: Stroke[] = [];
    private redoStrokes: Stroke[] = [];
    private currentStroke: Stroke | null = null;

    // Drawing dynamics
    private lastDrawTime = 0;
    private lastPoint: Point | null = null;
    private lastStrokeTime = 0;
    private strokeBuffer: Stroke[] = [];
    private strokeTimeout = 20;
    private proximityThreshold = 10;

    // Viewport and interaction
    private scale = 1;
    private viewportX = 0;
    private viewportY = 0;
    private isPanning = false;
    private isZooming = false;
    private lastPanPoint: Point | null = null;
    private initialDistance = 0;
    private initialScale = 1;
    private minScale = 0.5;
    private maxScale = 5;
    private zoomCenterX = 0;
    private zoomCenterY = 0;
    private touchPoints = new Map<number, Point>();
    private minDistance: number;
    private maxDistance: number;

    // Grid and display
    private showGrid = true;
    private dpr: number;

    // Shape handling
    private shapes: Shape[] = [];
    // private selectedShape: Shape | null = null;
    // private resizeHandleSize = 8;
    private isDrawingShape = false;
    private shapeStartPoint: Point | null = null;

    // Gesture handling
    private lastTapTime = 0;
    private tapCount = 0;
    private twoFingerTapDelay = 300;
    private drawQueue: any[] = [];  // Used for animation frame handling

    constructor(private canvas: HTMLCanvasElement, private toolbar: HTMLElement) {
        console.log('DrawingApp constructor called');

        // Initialize basic properties
        this.dpr = window.devicePixelRatio || 1;
        this.minDistance = 0.5 * this.dpr;
        this.maxDistance = 40 * this.dpr;
        this.brushSize = this.brushSizes.small;

        // Initialize contexts
        const ctx = canvas.getContext('2d', {
            desynchronized: true,
            alpha: false
        });
        if (!ctx) throw new Error('Failed to get canvas context');
        this.ctx = ctx;

        // Create offscreen canvases
        this.offscreenCanvas = new OffscreenCanvas(100, 100);
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
            desynchronized: true,
            alpha: false
        })!;

        this.activeCanvas = new OffscreenCanvas(100, 100);
        this.activeCtx = this.activeCanvas.getContext('2d', {
            desynchronized: true,
            alpha: true
        })!;

        // Create eraser preview
        this.eraserPreview = document.createElement('div');
        this.eraserPreview.id = 'eraser-preview';
        document.body.appendChild(this.eraserPreview);

        // Wait for next frame to ensure container is sized
        requestAnimationFrame(() => {
            this.initCanvas();
            this.initEvents();
            this.loadState();
            this.startDrawLoop();
            this.initGrid();
        });
    }

    private initCanvas() {
        // Set absolute positioning for main canvas to match grid
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        
        const resizeCanvas = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = this.canvas.getBoundingClientRect();

            if (rect.width === 0 || rect.height === 0) {
                console.warn('Canvas has zero dimensions, retrying in next frame');
                requestAnimationFrame(resizeCanvas);
                return;
            }

            // Set the canvas size in pixels
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;

            // Also resize grid canvas to match
            if (this.gridCanvas) {
                this.gridCanvas.width = this.canvas.width;
                this.gridCanvas.height = this.canvas.height;
            }

            // Reset the context scale
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Scale the context to account for the device pixel ratio
            this.ctx.scale(dpr, dpr);

            // Set white background
            const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--background-primary').trim() || '#ffffff';
            this.ctx.fillStyle = backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Resize offscreen canvases
            this.offscreenCanvas = new OffscreenCanvas(this.canvas.width, this.canvas.height);
            this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
                desynchronized: true,
                alpha: false
            })!;

            this.activeCanvas = new OffscreenCanvas(this.canvas.width, this.canvas.height);
            this.activeCtx = this.activeCanvas.getContext('2d', {
                desynchronized: true,
                alpha: true
            })!;

            this.redrawCanvas();
        };

        // Initial resize
        resizeCanvas();

        // Handle window resize
        const debouncedResize = this.debounce(resizeCanvas, 250);
        window.addEventListener('resize', debouncedResize);
    }

    // Add debounce helper method
    private debounce(func: Function, wait: number) {
        let timeout: number | null = null;
        return (...args: any[]) => {
            if (timeout) {
                window.clearTimeout(timeout);
            }
            timeout = window.setTimeout(() => {
                func.apply(this, args);
            }, wait);
        };
    }

    destroy() {
        // Clean up event listeners and resources
        window.removeEventListener('resize', this.initCanvas.bind(this));
        this.eraserPreview.remove();
        // Add any other cleanup needed
    }

    private getMidpoint(touch1: Touch, touch2: Touch): Point {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2,
            pressure: 1,
            time: performance.now()
        };
    }

    private getDistance(touch1: Touch, touch2: Touch): number {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private initEvents() {


        // Add touch-action style to prevent default touch behaviors
        this.canvas.style.touchAction = 'none';

        // Enable pointer capture
        this.canvas.addEventListener('pointerdown', (e) => {
            this.canvas.setPointerCapture(e.pointerId);

            // ... rest of your pointerdown code ...
        });

  

        // Add touch event handlers for two-finger tap
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const now = performance.now();

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

        // Add touch event handlers for gestures
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.updateTouchPoints(e);

            if (e.touches.length === 2) {
                // Stop any ongoing drawing
                this.isDrawing = false;
                this.currentStroke = null;

                // Get initial touch points
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                
                // Store initial distance for zoom
                this.initialDistance = this.getDistance(touch1, touch2);
                this.initialScale = this.scale;
                
                // Calculate zoom center
                const midpoint = this.getMidpoint(touch1, touch2);
                this.zoomCenterX = midpoint.x;
                this.zoomCenterY = midpoint.y;
                
                // Start panning by default
                this.isPanning = true;
                this.lastPanPoint = midpoint;
                
                // If distance is changing rapidly, switch to zooming
                this.isZooming = false;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            
            if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentMidpoint = this.getMidpoint(touch1, touch2);
                
                // Check if we should switch to zooming
                if (!this.isZooming) {
                    const currentDistance = this.getDistance(touch1, touch2);
                    const distanceDelta = Math.abs(currentDistance - this.initialDistance);
                    if (distanceDelta > 10) { // threshold for zoom detection
                        this.isZooming = true;
                        this.isPanning = false;
                    }
                }

                if (this.isZooming) {
                    const currentDistance = this.getDistance(touch1, touch2);
                    let newScale = (currentDistance / this.initialDistance) * this.initialScale;
                    newScale = Math.min(Math.max(newScale, this.minScale), this.maxScale);

                    // Get the zoom point in canvas coordinates
                    const rect = this.canvas.getBoundingClientRect();
                    const zoomX = (this.zoomCenterX - rect.left);
                    const zoomY = (this.zoomCenterY - rect.top);

                    // Convert to world coordinates
                    const worldX = (zoomX + this.viewportX) / this.scale;
                    const worldY = (zoomY + this.viewportY) / this.scale;

                    // Update scale
                    this.scale = newScale;

                    // Update viewport to maintain zoom point
                    this.viewportX = (worldX * this.scale) - zoomX;
                    this.viewportY = (worldY * this.scale) - zoomY;
                } else if (this.isPanning) {
                    if (this.lastPanPoint) {
                        const dx = (currentMidpoint.x - this.lastPanPoint.x) / this.scale;
                        const dy = (currentMidpoint.y - this.lastPanPoint.y) / this.scale;
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
                this.lastPanPoint = null;
                this.initialDistance = 0;
                this.zoomCenterX = 0;
                this.zoomCenterY = 0;
            }
        });

        // Add stroke connection logic to draw method
        if (this.currentStroke) {
            this.connectStrokes();
            this.processStrokeBuffer();
        }

        // Add shape handling
        if (this.currentTool === 'rectangle') {
            this.canvas.addEventListener('pointerdown', this.startDrawingShape.bind(this));
            this.canvas.addEventListener('pointermove', this.updateShape.bind(this));
        }

        // Initialize panning
        this.initPanning();

        // Add eraser preview handlers
        this.canvas.addEventListener('pointerenter', () => {
            if (this.currentTool === 'eraser') {
                this.eraserPreview.style.display = 'block';
            }
        });

        this.canvas.addEventListener('pointerleave', () => {
            this.eraserPreview.style.display = 'none';
        });

        this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
            if (this.currentTool === 'eraser') {
                this.positionEraserPreview(e);
                const point: Point = {
                    x: (e.offsetX * this.dpr + this.viewportX) / this.scale,
                    y: (e.offsetY * this.dpr + this.viewportY) / this.scale,
                    pressure: e.pressure || 1,
                    time: performance.now()
                };

                if (this.lastPoint) {
                    this.eraseArea(this.lastPoint, point, this.brushSize / 2);
                }
                this.lastPoint = point;
            }
        });

        // Replace existing drawing handlers with unified pointer events
        this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            console.log('Pointer down:', {
                button: e.button,
                currentTool: this.currentTool,
                isPanning: this.isPanning
            });

            if (e.button !== 0) return;

            if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
                this.isDrawing = true;
                this.currentStroke = {
                    points: [],
                    tool: this.currentTool,
                    color: this.color,
                    brushSize: this.brushSize
                };

                const rect = this.canvas.getBoundingClientRect();
                const point: Point = {
                    x: ((e.clientX - rect.left) + this.viewportX) / this.scale,
                    y: ((e.clientY - rect.top) + this.viewportY) / this.scale,
                    pressure: e.pressure || 1,
                    time: performance.now()
                };

                console.log('Starting point:', {
                    raw: { x: e.clientX, y: e.clientY },
                    rect: { left: rect.left, top: rect.top },
                    transformed: point,
                    scale: this.scale,
                    viewport: { x: this.viewportX, y: this.viewportY }
                });

                this.currentStroke.points.push(point);
                this.lastPoint = point;
                this.drawStrokeLine(point, point, this.currentStroke, this.ctx);
            }
        });

        this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
            if (!this.isDrawing || this.isPanning || 
                (this.currentTool !== 'pen' && this.currentTool !== 'eraser')) return;

            const rect = this.canvas.getBoundingClientRect();
            const point: Point = {
                x: ((e.clientX - rect.left) + this.viewportX) / this.scale,
                y: ((e.clientY - rect.top) + this.viewportY) / this.scale,
                pressure: e.pressure || 1,
                time: performance.now()
            };


            if (this.currentStroke && this.lastPoint) {
                this.currentStroke.points.push(point);
                this.drawStrokeLine(this.lastPoint, point, this.currentStroke, this.ctx);
            }

            this.lastPoint = point;
        });

        this.canvas.addEventListener('pointerup', () => {
            console.log('Pointer up:', {
                isDrawing: this.isDrawing,
                hasCurrentStroke: !!this.currentStroke,
                strokePoints: this.currentStroke?.points.length
            });

            if (this.isDrawing && this.currentStroke) {
                this.strokes.push(this.currentStroke);
                this.redoStrokes = [];
                this.saveState();
                this.saveToLocalStorage();
            }

            this.isDrawing = false;
            this.currentStroke = null;
            this.lastPoint = null;
        });

        this.canvas.addEventListener('pointerleave', () => {
            if (this.isDrawing && this.currentStroke) {
                this.strokes.push(this.currentStroke);
                this.redoStrokes = [];
                this.saveState();
                this.saveToLocalStorage();
            }

            this.isDrawing = false;
            this.currentStroke = null;
            this.lastPoint = null;
        });

        // Initialize toolbar buttons
        this.initToolbar();

        // Start the draw loop
        this.startDrawLoop();

        // Add trackpad gesture support
        this.canvas.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();

            if (e.ctrlKey) {
                // Pinch to zoom (trackpad)
                const scaleFactor = 1 - e.deltaY * 0.01;
                let newScale = this.scale * scaleFactor;
                newScale = Math.min(Math.max(newScale, this.minScale), this.maxScale);

                // Get the pointer position in canvas coordinates
                const rect = this.canvas.getBoundingClientRect();
                const zoomX = (e.clientX - rect.left) * this.dpr;
                const zoomY = (e.clientY - rect.top) * this.dpr;

                // Convert to world coordinates (before scale change)
                const worldX = (zoomX + this.viewportX) / this.scale;
                const worldY = (zoomY + this.viewportY) / this.scale;

                // Update scale
                this.scale = newScale;

                // Update viewport to maintain zoom point
                this.viewportX = (worldX * this.scale) - zoomX;
                this.viewportY = (worldY * this.scale) - zoomY;
            } else {
                // Regular wheel event for panning (trackpad)
                const panFactor = 1.2;  // Make panning feel more natural
                this.viewportX += e.deltaX * panFactor;
                this.viewportY += e.deltaY * panFactor;
            }

            // Update grid and redraw
            this.updateGridTransform();
            this.redrawCanvas();
        }, { passive: false });

        // Touch events for iPad
        this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
            e.preventDefault();
            
            if (e.touches.length === 2) {
                // Two-finger gesture
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                
                // Store initial distance for zoom
                this.initialDistance = this.getDistance(touch1, touch2);
                this.initialScale = this.scale;
                
                // Calculate zoom center
                const midpoint = this.getMidpoint(touch1, touch2);
                this.zoomCenterX = midpoint.x;
                this.zoomCenterY = midpoint.y;
                
                // Start panning by default
                this.isPanning = true;
                this.lastPanPoint = midpoint;
                
                // Reset zooming flag
                this.isZooming = false;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
            e.preventDefault();
            
            if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentMidpoint = this.getMidpoint(touch1, touch2);
                
                // Check if we should switch to zooming
                if (!this.isZooming) {
                    const currentDistance = this.getDistance(touch1, touch2);
                    const distanceDelta = Math.abs(currentDistance - this.initialDistance);
                    if (distanceDelta > 10) {
                        this.isZooming = true;
                        this.isPanning = false;
                    }
                }

                if (this.isZooming) {
                    const currentDistance = this.getDistance(touch1, touch2);
                    let newScale = (currentDistance / this.initialDistance) * this.initialScale;
                    newScale = Math.min(Math.max(newScale, this.minScale), this.maxScale);

                    // Get the zoom point in canvas coordinates
                    const rect = this.canvas.getBoundingClientRect();
                    const zoomX = (this.zoomCenterX - rect.left);
                    const zoomY = (this.zoomCenterY - rect.top);

                    // Convert to world coordinates
                    const worldX = (zoomX + this.viewportX) / this.scale;
                    const worldY = (zoomY + this.viewportY) / this.scale;

                    // Update scale
                    this.scale = newScale;

                    // Update viewport to maintain zoom point
                    this.viewportX = (worldX * this.scale) - zoomX;
                    this.viewportY = (worldY * this.scale) - zoomY;
                } else if (this.isPanning) {
                    if (this.lastPanPoint) {
                        const dx = (currentMidpoint.x - this.lastPanPoint.x) / this.scale;
                        const dy = (currentMidpoint.y - this.lastPanPoint.y) / this.scale;
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

        this.canvas.addEventListener('touchend', (e: TouchEvent) => {
            if (e.touches.length === 0) {
                this.isPanning = false;
                this.isZooming = false;
                this.lastPanPoint = null;
                this.initialDistance = 0;
                this.zoomCenterX = 0;
                this.zoomCenterY = 0;
            }
        });
    }

    private initToolbar() {
        // Tool buttons
        const toolButtons = this.toolbar.querySelectorAll('[data-tool]');
        toolButtons.forEach(button => {
            button.addEventListener('click', () => {
                toolButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.currentTool = button.getAttribute('data-tool') || 'pen';

                if (this.currentTool === 'eraser') {
                    this.updateEraserPreview();
                } else {
                    this.eraserPreview.style.display = 'none';
                }
            });
        });

        // Size buttons
        const sizeButtons = this.toolbar.querySelectorAll('[data-size]');
        sizeButtons.forEach(button => {
            button.addEventListener('click', () => {
                sizeButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                const size = button.getAttribute('data-size') as BrushSize || 'small';
                this.brushSize = this.currentTool === 'eraser' ?
                    this.eraserSizes[size] :
                    this.brushSizes[size];

                if (this.currentTool === 'eraser') {
                    this.updateEraserPreview();
                }
            });
        });

        // Color picker
        const colorPicker = this.toolbar.querySelector('.color-picker') as HTMLInputElement;
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.color = (e.target as HTMLInputElement).value;
            });
            colorPicker.addEventListener('change', (e) => {
                this.color = (e.target as HTMLInputElement).value;
            });
        }

        // Action buttons
        const clearButton = this.toolbar.querySelector('#clear');
        clearButton?.addEventListener('click', () => this.clearCanvas());

        const undoButton = this.toolbar.querySelector('#undo');
        undoButton?.addEventListener('click', () => this.undo());

        const redoButton = this.toolbar.querySelector('#redo');
        redoButton?.addEventListener('click', () => this.redo());
    }

    private startDrawing(e: PointerEvent) {
        if (e.pointerType === 'touch') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        const rect = this.canvas.getBoundingClientRect();
        const point: Point = {
            x: ((e.clientX - rect.left)) / this.scale,
            y: ((e.clientY - rect.top)) / this.scale,
            pressure: e.pressure || 1,
            time: performance.now()
        };

        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
            this.isDrawing = true;
            this.currentStroke = {
                points: [point],
                tool: this.currentTool,
                color: this.color,
                brushSize: this.brushSize
            };
            this.lastPoint = point;
        }
    }

    private draw(e: PointerEvent) {
        if (!this.isDrawing || this.isPanning ||
            (this.currentTool !== 'pen' && this.currentTool !== 'eraser')) return;

        const rect = this.canvas.getBoundingClientRect();
        const point: Point = {
            x: ((e.clientX - rect.left)) / this.scale,
            y: ((e.clientY - rect.top)) / this.scale,
            pressure: e.pressure || 1,
            time: performance.now()
        };

        if (this.currentStroke && this.lastPoint) {
            this.currentStroke.points.push(point);
            this.drawStrokeLine(this.lastPoint, point, this.currentStroke, this.ctx);
        }

        this.lastPoint = point;
    }

    private endDrawing() {
        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
            if (!this.isDrawing) return;

            if (this.currentStroke && this.currentStroke.points.length > 0) {
                this.strokes.push(this.currentStroke);
                this.redoStrokes = [];
                this.saveState();
                this.saveToLocalStorage();
            }

            this.isDrawing = false;
            this.currentStroke = null;
            this.lastPoint = null;
        }
    }

    private clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];
        this.redoStrokes = [];
        this.saveState();
        this.saveToLocalStorage();
    }

    private saveState() {
        const currentState = this.canvas.toDataURL();
        const lastState = this.strokes.length > 0 ?
            this.strokes[this.strokes.length - 1].dataUrl : null;

        if (currentState !== lastState) {
            this.strokes.push({
                points: [],
                tool: 'pen',
                color: this.color,
                brushSize: this.brushSize,
                dataUrl: currentState
            });
            this.redoStrokes = [];
            if (this.strokes.length > 50) {
                this.strokes.shift();
            }
            this.saveToLocalStorage();
        }
    }

    private undo() {
        if (this.strokes.length > 0) {
            const stroke = this.strokes.pop();
            if (stroke) {
                this.redoStrokes.push(stroke);
                this.redrawCanvas();
                this.saveToLocalStorage();
            }
        }
    }

    private redo() {
        if (this.redoStrokes.length > 0) {
            const stroke = this.redoStrokes.pop();
            if (stroke) {
                this.strokes.push(stroke);
                this.drawStroke(stroke, this.ctx);
                this.saveToLocalStorage();
            }
        }
    }

    private loadState() {
        const saved = localStorage.getItem('canvasStrokes');
        if (saved) {
            const data = JSON.parse(saved);
            this.strokes = data.strokes || [];
            this.shapes = data.shapes || [];
            this.redoStrokes = data.redoStrokes || [];
            this.redrawCanvas();
        }
    }

    private saveToLocalStorage() {
        localStorage.setItem('canvasStrokes', JSON.stringify({
            strokes: this.strokes,
            shapes: this.shapes,
            redoStrokes: this.redoStrokes
        }));
    }

    private redrawCanvas() {
        // Clear and set white background
        const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--background-primary').trim() || '#ffffff';
        this.ctx.fillStyle = backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply transforms for drawing
        this.ctx.save();
        this.ctx.scale(this.scale, this.scale);
        this.ctx.translate(-this.viewportX, -this.viewportY);

        // Draw all strokes
        for (const stroke of this.strokes) {
            this.drawStroke(stroke, this.ctx);
        }

        this.ctx.restore();

        // Update grid
        if (this.showGrid) {
            this.updateGridTransform();
        }
    }

    private calculateVelocity(point: Point): number {
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

        return distance / timeElapsed;
    }

    private drawStroke(stroke: Stroke, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
        const points = stroke.points;
        if (points.length < 2) return;

        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (stroke.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = stroke.color;
        }

        const strokeWidth = stroke.brushSize * 0.85;
        ctx.lineWidth = strokeWidth / this.scale;

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            if (i === 0) {
                ctx.moveTo(p1.x, p1.y);
            }
            ctx.lineTo(p2.x, p2.y);
        }

        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
    }

    private startDrawLoop() {
        const drawFrame = () => {
            while (this.drawQueue.length > 0) {
                const task = this.drawQueue.shift();
                if (task) task();
            }
            requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);
    }

    private initGrid() {
        const gridToggle = this.toolbar.querySelector('#grid-toggle');
        const container = this.canvas.parentElement;
        
        // Create grid canvas
        this.gridCanvas = document.createElement('canvas');
        this.gridCanvas.style.position = 'absolute';
        this.gridCanvas.style.top = '0';
        this.gridCanvas.style.left = '0';
        this.gridCanvas.style.pointerEvents = 'none';
        this.gridCanvas.style.zIndex = '1';  // Add z-index
        container?.appendChild(this.gridCanvas);
        this.gridCtx = this.gridCanvas.getContext('2d', { alpha: true });  // Enable alpha
        
        // Match canvas size with DPR scaling
        this.gridCanvas.width = this.canvas.width;
        this.gridCanvas.height = this.canvas.height;
        this.gridCanvas.style.width = '100%';  // Changed from copying canvas.style.width
        this.gridCanvas.style.height = '100%'; // Changed from copying canvas.style.height
        
        // Set initial grid state
        this.showGrid = true;
        gridToggle?.classList.add('active');
        
        gridToggle?.addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            gridToggle.classList.toggle('active');
            this.updateGridTransform();
        });

        // Initial draw
        this.updateGridTransform();
    }

    private updateGridTransform() {
        if (!this.showGrid || !this.gridCtx) return;

        // Clear the grid canvas
        this.gridCtx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);
        
        // Apply transforms for grid - exactly matching main canvas
        this.gridCtx.save();
        this.gridCtx.translate(-this.viewportX, -this.viewportY);
        this.gridCtx.scale(this.scale, this.scale);
        
        const gridSize = 40;
        const width = this.gridCanvas.width / this.scale + gridSize;
        const height = this.gridCanvas.height / this.scale + gridSize;
        
        this.gridCtx.beginPath();
        this.gridCtx.strokeStyle = 'rgba(0,0,0,0.1)';
        this.gridCtx.lineWidth = 1 / this.scale;

        // Calculate grid offset
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

    private initPanning() {
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();

            // Store touch points
            Array.from(e.touches).forEach(touch => {
                this.touchPoints.set(touch.identifier, {
                    x: touch.clientX,
                    y: touch.clientY,
                    pressure: 1,
                    time: performance.now()
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
                    const dx = (currentMidpoint.x - this.lastPanPoint.x) / this.scale;
                    const dy = (currentMidpoint.y - this.lastPanPoint.y) / this.scale;

                    this.viewportX -= dx;
                    this.viewportY -= dy;

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

    private updateEraserPreview() {
        if (!this.eraserPreview) return;

        const size = this.brushSize / this.dpr;
        this.eraserPreview.style.width = `${size}px`;
        this.eraserPreview.style.height = `${size}px`;
    }

    private positionEraserPreview(e: PointerEvent) {
        if (this.currentTool !== 'eraser') return;

        const size = this.brushSize / this.dpr;
        this.eraserPreview.style.left = `${e.clientX - size / 2}px`;
        this.eraserPreview.style.top = `${e.clientY - size / 2}px`;
        this.eraserPreview.style.display = 'block';
    }

    // private drawShape(shape: Shape) {
    //     this.ctx.beginPath();
    //     this.ctx.strokeStyle = shape.color;
    //     this.ctx.lineWidth = 2 / this.scale;
    //     this.ctx.rect(shape.x, shape.y, shape.width, shape.height);
    //     this.ctx.stroke();
    // }

    // private drawSelectionHandles(shape: Shape) {
    //     const handles = this.getResizeHandles(shape);
    //     this.ctx.fillStyle = '#ffffff';
    //     this.ctx.strokeStyle = '#000000';
    //     this.ctx.lineWidth = 1 / this.scale;

    //     handles.forEach(handle => {
    //         this.ctx.beginPath();
    //         const size = this.resizeHandleSize / this.scale;
    //         this.ctx.rect(handle.x - size/2, handle.y - size/2, size, size);
    //         this.ctx.fill();
    //         this.ctx.stroke();
    //     });
    // }

    // private getResizeHandles(shape: Shape) {
    //     return [
    //         { x: shape.x, y: shape.y, cursor: 'nw-resize', position: 'nw' },
    //         { x: shape.x + shape.width, y: shape.y, cursor: 'ne-resize', position: 'ne' },
    //         { x: shape.x, y: shape.y + shape.height, cursor: 'sw-resize', position: 'sw' },
    //         { x: shape.x + shape.width, y: shape.y + shape.height, cursor: 'se-resize', position: 'se' }
    //     ];
    // }

    // private getShapeAtPoint(point: Point): Shape | null {
    //     return this.shapes.find(shape => 
    //         point.x >= shape.x && 
    //         point.x <= shape.x + shape.width &&
    //         point.y >= shape.y && 
    //         point.y <= shape.y + shape.height
    //     ) || null;
    // }

    // private checkResizeHandles(point: Point) {
    //     if (!this.selectedShape) return null;

    //     const handles = this.getResizeHandles(this.selectedShape);
    //     for (const handle of handles) {
    //         if (this.pointInHandle(point, handle)) {
    //             this.activeHandle = handle.position;
    //             return;
    //         }
    //     }
    //     this.activeHandle = null;
    // }

    // private pointInHandle(point: Point, handle: any): boolean {
    //     const halfSize = (this.resizeHandleSize * 2) / this.scale;
    //     return (
    //         point.x >= handle.x - halfSize &&
    //         point.x <= handle.x + halfSize &&
    //         point.y >= handle.y - halfSize &&
    //         point.y <= handle.y + halfSize
    //     );
    // }

    // private resizeShape(shape: Shape, handle: string, point: Point) {
    //     const originalX = shape.x;
    //     const originalY = shape.y;
    //     const originalWidth = shape.width;
    //     const originalHeight = shape.height;

    //     switch (handle) {
    //         case 'nw':
    //             shape.width = originalWidth + (originalX - point.x);
    //             shape.height = originalHeight + (originalY - point.y);
    //             shape.x = point.x;
    //             shape.y = point.y;
    //             break;
    //         case 'ne':
    //             shape.width = point.x - shape.x;
    //             shape.height = originalHeight + (originalY - point.y);
    //             shape.y = point.y;
    //             break;
    //         case 'sw':
    //             shape.width = originalWidth + (originalX - point.x);
    //             shape.height = point.y - shape.y;
    //             shape.x = point.x;
    //             break;
    //         case 'se':
    //             shape.width = point.x - shape.x;
    //             shape.height = point.y - shape.y;
    //             break;
    //     }

    //     this.saveState();
    // }

    private processStrokeBuffer() {
        const now = performance.now();
        if (now - this.lastStrokeTime > this.strokeTimeout) {
            if (this.strokeBuffer.length > 0) {
                this.strokes.push(...this.strokeBuffer);
                this.strokeBuffer = [];
                this.redrawCanvas();
            }
            this.lastStrokeTime = now;
        }
    }

    private startDrawingShape(e: PointerEvent) {
        if (this.currentTool === 'rectangle') {
            this.isDrawingShape = true;
            this.shapeStartPoint = {
                x: (e.offsetX * this.dpr + this.viewportX) / this.scale,
                y: (e.offsetY * this.dpr + this.viewportY) / this.scale,
                pressure: 1,
                time: performance.now()
            };
        }
    }

    private updateShape(e: PointerEvent) {
        if (!this.isDrawingShape || !this.shapeStartPoint) return;

        const currentPoint = {
            x: (e.offsetX * this.dpr + this.viewportX) / this.scale,
            y: (e.offsetY * this.dpr + this.viewportY) / this.scale,
            pressure: 1,
            time: performance.now()
        };

        // Create temporary shape for preview
        this.redrawCanvas();
        this.drawTemporaryShape(this.shapeStartPoint, currentPoint);
    }

    private handleTwoFingerTap(e: TouchEvent) {
        const now = performance.now();
        if (e.touches.length === 2) {
            if (now - this.lastTapTime < this.twoFingerTapDelay) {
                this.tapCount++;
                if (this.tapCount === 2) {
                    this.undo();
                    this.tapCount = 0;
                }
            } else {
                this.tapCount = 1;
            }
            this.lastTapTime = now;
        }
    }

    private startZoom(e: TouchEvent) {
        if (e.touches.length === 2) {
            this.isZooming = true;
            this.zoomCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            this.zoomCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            this.initialDistance = this.getDistance(e.touches[0], e.touches[1]);
            this.initialScale = this.scale;
        }
    }

    private splitStroke(stroke: Stroke, p1: Point, p2: Point, radius: number): Stroke[] {
        const newStrokes: Stroke[] = [];
        let currentStroke: Stroke = {
            points: [],
            tool: stroke.tool,
            color: stroke.color,
            brushSize: stroke.brushSize
        };

        for (const point of stroke.points) {
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

    private connectStrokes() {
        if (this.currentStroke && this.lastPoint) {
            for (const stroke of this.strokes) {
                if (stroke.tool === this.currentTool && stroke.color === this.color) {
                    const lastPointOfStroke = stroke.points[stroke.points.length - 1];
                    const distance = this.getPointDistance(this.lastPoint, lastPointOfStroke);

                    if (distance < this.proximityThreshold) {
                        stroke.points.push(...this.currentStroke.points);
                        this.currentStroke = null;
                        break;
                    }
                }
            }
        }
    }

    private updateTouchPoints(e: TouchEvent) {
        // Clear old points
        this.touchPoints.clear();

        // Add new points
        Array.from(e.touches).forEach(touch => {
            this.touchPoints.set(touch.identifier, {
                x: touch.clientX,
                y: touch.clientY,
                pressure: touch.force || 1,
                time: performance.now()
            });
        });
    }

    private handleTouchMove(e: TouchEvent) {
        if (e.touches.length === 2) {
            this.updateTouchPoints(e);
            if (this.isZooming) {
                this.handleZoom(e);
            } else if (this.isPanning) {
                this.handlePan(e);
            }
        }
    }

    private handleZoom(e: TouchEvent) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = this.getDistance(touch1, touch2);
        let newScale = (currentDistance / this.initialDistance) * this.initialScale;
        newScale = Math.min(Math.max(newScale, this.minScale), this.maxScale);

        const rect = this.canvas.getBoundingClientRect();
        const zoomX = (this.zoomCenterX - rect.left);
        const zoomY = (this.zoomCenterY - rect.top);

        // Convert to world coordinates (before scale change)
        const worldX = (zoomX + this.viewportX) / this.scale;
        const worldY = (zoomY + this.viewportY) / this.scale;

        // Update scale
        this.scale = newScale;

        // Update viewport to maintain zoom point
        this.viewportX = (worldX * this.scale) - zoomX;
        this.viewportY = (worldY * this.scale) - zoomY;

        this.updateGridTransform();
        this.redrawCanvas();
    }

    private handlePan(e: TouchEvent) {
        if (!this.lastPanPoint) return;

        const currentMidpoint = this.getMidpoint(e.touches[0], e.touches[1]);
        const dx = (currentMidpoint.x - this.lastPanPoint.x) / this.scale;
        const dy = (currentMidpoint.y - this.lastPanPoint.y) / this.scale;

        this.viewportX -= dx;
        this.viewportY -= dy;

        this.lastPanPoint = currentMidpoint;

        this.updateGridTransform();
        this.redrawCanvas();
    }

    private drawTemporaryShape(start: Point, end: Point) {
        this.ctx.save();
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.beginPath();
        this.ctx.rect(
            start.x,
            start.y,
            end.x - start.x,
            end.y - start.y
        );
        this.ctx.stroke();
        this.ctx.restore();
    }

    private eraseArea(p1: Point, p2: Point, radius: number) {
        let modified = false;

        for (let i = this.strokes.length - 1; i >= 0; i--) {
            const stroke = this.strokes[i];
            if (!stroke.erased && stroke.points && stroke.points.length > 0) {
                if (this.strokeIntersectsEraser(stroke, p1, p2, radius)) {
                    const newStrokes = this.splitStroke(stroke, p1, p2, radius);
                    if (newStrokes.length > 0) {
                        this.strokes.splice(i, 1);
                        this.strokes.push(...newStrokes);
                        modified = true;
                    } else {
                        stroke.erased = true;
                        modified = true;
                    }
                }
            }
        }

        if (modified) {
            this.redrawCanvas();
        }
    }

    private strokeIntersectsEraser(stroke: Stroke, p1: Point, p2: Point, radius: number): boolean {
        if (!stroke.points) return false;

        for (let i = 0; i < stroke.points.length - 1; i++) {
            const strokeP1 = stroke.points[i];
            const strokeP2 = stroke.points[i + 1];
            if (this.lineSegmentDistance(strokeP1, strokeP2, p1, p2) < radius) {
                return true;
            }
        }
        return false;
    }

    private pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
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

    private lineSegmentDistance(l1p1: Point, l1p2: Point, l2p1: Point, l2p2: Point): number {
        // Returns minimum distance between two line segments
        const distances = [
            this.pointToLineDistance(l1p1, l2p1, l2p2),
            this.pointToLineDistance(l1p2, l2p1, l2p2),
            this.pointToLineDistance(l2p1, l1p1, l1p2),
            this.pointToLineDistance(l2p2, l1p1, l1p2)
        ];
        return Math.min(...distances);
    }

    private getPointDistance(p1: Point, p2: Point): number {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Add new helper method for drawing stroke lines
    private drawStrokeLine(p1: Point, p2: Point, stroke: Stroke, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (stroke.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = stroke.color;
        }

        ctx.lineWidth = stroke.brushSize / this.scale;

        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.globalCompositeOperation = 'source-over';
    }
}

interface Point {
    x: number;
    y: number;
    pressure: number;
    time: number;
}

interface Stroke {
    points: Point[];
    tool: string;
    color: string;
    brushSize: number;
    erased?: boolean;
    dataUrl?: string;
}

interface Shape {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
} 