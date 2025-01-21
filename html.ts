export const html = `
    <style>
        :root {
            --toolbar-height: 60px;
            --toolbar-bg: #f0f0f0;
        }

        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            touch-action: none;
            -webkit-user-select: none;
            user-select: none;
        }

        .drawing-container {
            position: relative;
            width: 100%;
            height: 500px;
            resize: vertical;
            overflow: hidden;
        }

        #canvas-container {
            position: absolute;
            top: var(--toolbar-height);
            left: 0;
            right: 0;
            bottom: 0;
            background-color: transparent;
        }

        #drawing-canvas {
            width: 100%;
            height: 100%;
            touch-action: none;
        }

        #toolbar {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: var(--toolbar-height);
            background: var(--background-secondary);
            display: flex;
            align-items: center;
            padding: 0 1rem;
            gap: 1rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 1;
        }

        .tool-group {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }

        .color-picker {
            width: 40px;
            height: 40px;
            border: none;
            padding: 0;
            border-radius: 50%;
            cursor: pointer;
            margin-right: 10px;
        }

        .brush-size {
            width: 100px;
        }

        .tool-button {
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 32px;
            width: 32px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }

        .tool-button.active {

        }

        .tool-button[data-size="small"] {
            font-size: 12px;
        }
        
        .tool-button[data-size="medium"] {
            font-size: 12px;
        }
        
        .tool-button[data-size="large"] {
            font-size: 14px;
        }

        .grid-pattern {
            position: relative;
        }

        .grid-pattern::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            background-image: 
                linear-gradient(to right, var(--divider-color) 1px, transparent 1px),
                linear-gradient(to bottom, var(--divider-color) 1px, transparent 1px);
            background-size: var(--grid-size, 20px) var(--grid-size, 20px);
            background-position: var(--grid-offset-x, 0px) var(--grid-offset-y, 0px);
            background-attachment: local;
            will-change: transform;
        }

        #eraser-preview {
            position: fixed;
            pointer-events: none;
            border: 2px solid var(--text-normal);
            border-radius: 50%;
            display: none;
            z-index: 2;
        }
    </style>

    <div class="toolbar">
        <div class="tool-group">
            <button class="tool-button active" data-tool="pen"><svg xmlns="http://www.w3.org/2000/svg"width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pen"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg></button>
            <button class="tool-button" data-tool="eraser"><svg xmlns="http://www.w3.org/2000/svg"width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg></button>
            <!-- <button class="tool-button" data-tool="rectangle"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg></button> -->
        </div>
        <div class="tool-group">
            <input type="color" class="color-picker" value="#000000">
            <button class="tool-button active" data-size="small">•</button>
            <button class="tool-button" data-size="medium">●</button>
            <button class="tool-button" data-size="large">⬤</button>
        </div>
        <div class="tool-group">
            <button class="tool-button grid-toggle"><svg xmlns="http://www.w3.org/2000/svg"width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-grid-3x3"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg></button>
            <button class="tool-button clear"><svg xmlns="http://www.w3.org/2000/svg"width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
            <button class="tool-button undo"><svg xmlns="http://www.w3.org/2000/svg"width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-undo"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg></button>
            <button class="tool-button redo"><svg xmlns="http://www.w3.org/2000/svg"width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-redo-2"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/></svg></button>
        </div>
    </div>
    <div class="canvas-container">
        <canvas class="drawing-canvas"></canvas>
    </div>
    <div class="eraser-preview"></div>

`
