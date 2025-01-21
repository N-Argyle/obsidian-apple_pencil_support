import { Plugin, TFile, Notice } from 'obsidian';

import { html } from './html';
import { DrawingApp } from './DrawingAppNew';

// interface MyPluginSettings {
// 	mySetting: string;
// }

// const DEFAULT_SETTINGS: MyPluginSettings = {
// 	mySetting: 'default'
// }

export default class DrawingPlugin extends Plugin {
	// settings: MyPluginSettings;
	public drawingApps: Map<string, DrawingApp> = new Map();

	async onload() {
		// await this.loadSettings();

		// Register the drawing view for code blocks
		this.registerMarkdownCodeBlockProcessor("pencil", async (source, el, ctx) => {
			console.log('Creating new drawing instance');

			// Create a unique ID for this drawing instance
			let drawingId;
			
			// Try to parse existing data to get drawingId
			if (source.trim()) {
				try {
					const data = JSON.parse(source.trim());
					drawingId = data.drawingId || `drawing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				} catch {
					drawingId = `drawing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				}
			} else {
				drawingId = `drawing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			}

			// Create the container structure
			const container = el.createDiv({ cls: 'drawing-container' });
			container.innerHTML = html;
			container.id = drawingId;
			container.style.width = "100%";
			container.style.height = "500px";
			container.style.resize = "none"; // Default to no resize

			// Add resize observer
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const height = entry.contentRect.height;
					const app = this.drawingApps.get(drawingId);
					if (app) {
						app.updateContainerHeight(height);
					}
				}
			});
			resizeObserver.observe(container);

			// Hide toolbar by default
			const toolbar = container.querySelector('#toolbar') as HTMLElement;
			if (toolbar) {
				toolbar.style.display = 'none';
			}

			// Add edit button
			const editButton = createEl('button', {
				cls: 'tool-button edit-button',
				attr: { 
					id: 'edit-drawing',
					style: 'position: absolute; top: 10px; right: 10px; z-index: 2;'
				}
			});
			editButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
			container.appendChild(editButton);

			// Add save button
			const saveButton = createEl('button', {
				cls: 'tool-button',
				attr: { 
					id: 'save-drawing',
					style: 'position: absolute; top: 10px; right: 10px; z-index: 2; display: none;'
				}
			});
			saveButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
			container.appendChild(saveButton);

			// Get CSS variable for background-secondary
			const style = getComputedStyle(document.body);
			const backgroundPrimary = style.getPropertyValue('--background-primary');
			const backgroundSecondary = style.getPropertyValue('--background-secondary');
			const dividerColor = style.getPropertyValue('--divider-color');
			const textColor = style.getPropertyValue('--text-normal');
			console.log('backgroundPrimary', backgroundPrimary);
			const initColors = {
				backgroundPrimary: backgroundPrimary,
				backgroundSecondary: backgroundSecondary,
				dividerColor: dividerColor,
				textColor: textColor,
			}
			console.log('initColors', initColors);

			// Create save to file callback
			const saveToFile = async (data: string) => {
				const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
				if (file && 'path' in file) {
					try {
						if (!(file instanceof TFile)) return;
						const content = await this.app.vault.read(file);
						
						// Add drawingId to the data object
						const dataObj = JSON.parse(data);
						dataObj.drawingId = drawingId;
						const dataWithId = JSON.stringify(dataObj);
						
						// Handle empty code block case
						const emptyBlock = '```pencil\n```';
						if (content.includes(emptyBlock)) {
							const newContent = content.replace(
								emptyBlock,
								`\`\`\`pencil\n${dataWithId}\n\`\`\``
							);
							await this.app.vault.modify(file, newContent);
							new Notice('Drawing saved to file');
							return;
						}
						
						// Handle existing block case
						const allCodeBlocks = content.match(/```pencil[\s\S]*?```/g) || [];
						let targetBlock = allCodeBlocks.find(block => {
							try {
								const blockData = JSON.parse(block.replace(/```pencil\n|\n```/g, ''));
								return blockData.drawingId === drawingId;
							} catch {
								return false;
							}
						});
						
						if (targetBlock) {
							const newContent = content.replace(
								targetBlock,
								`\`\`\`pencil\n${dataWithId}\n\`\`\``
							);
							await this.app.vault.modify(file, newContent);
							new Notice('Drawing saved to file');
						} else {
							console.error('Could not find matching code block');
						}
					} catch (error) {
						console.error('Failed to save drawing:', error);
						new Notice('Failed to save drawing');
					}
				}
			};

			// Wait for container to be fully rendered before initializing DrawingApp
			setTimeout(() => {
				const app = new DrawingApp(initColors, drawingId, container);
				this.drawingApps.set(drawingId, app);
				
				// Update element queries to use container
				const undoButton = container.querySelector('.undo');
				const redoButton = container.querySelector('.redo');
				const toolbar = container.querySelector('.toolbar') as HTMLElement;
				
				if (toolbar) {
					toolbar.style.display = 'none';
				}

				undoButton?.addEventListener('click', () => app.undo());
				redoButton?.addEventListener('click', () => app.redo());

				// Load existing data if present
				if (source.trim()) {
					try {
						const data = JSON.parse(source.trim());
						app.loadFromData(JSON.stringify(data));
					} catch (error) {
						console.error('Failed to parse drawing data:', error);
					}
				}

				// Disable canvas by default
				app.setEditMode(false);

				// Add edit button click handler
				editButton.addEventListener('click', () => {
					toolbar.style.display = 'flex';
					app.setEditMode(true);
					editButton.style.display = 'none';
					saveButton.style.display = 'block';
					container.style.resize = "vertical"; // Enable resize in edit mode
				});

				// Add save button click handler
				saveButton.addEventListener('click', () => {
					const data = app.getDrawingData();
					saveToFile(data);
					toolbar.style.display = 'none';
					app.setEditMode(false);
					saveButton.style.display = 'none';
					editButton.style.display = 'block';
					container.style.resize = "none"; // Disable resize after saving
				});

				// Add cleanup for resize observer
				this.register(() => resizeObserver.disconnect());
			}, 0);
		})
	}

	onunload() {
		// Clean up all drawing instances
		this.drawingApps.forEach(app => app.destroy());
		this.drawingApps.clear();
	}

	// async loadSettings() {
	// 	this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	// }

	// async saveSettings() {
	// 	await this.saveData(this.settings);
	// }
}
