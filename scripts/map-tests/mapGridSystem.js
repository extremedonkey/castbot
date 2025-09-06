import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Main MapGridSystem class for handling grid overlays on images
 */
export class MapGridSystem {
    constructor(imagePath, options = {}) {
        this.imagePath = imagePath;
        this.options = {
            gridSize: options.gridSize || 10,
            gridWidth: options.gridWidth || options.gridSize || 10,
            gridHeight: options.gridHeight || options.gridSize || 10,
            borderSize: options.borderSize || 80,
            lineWidth: options.lineWidth || 3,
            fontSize: options.fontSize || 36,
            gridColor: options.gridColor || 'black',
            borderColor: options.borderColor || 'white',
            labelStyle: options.labelStyle || 'standard', // standard, boxed, shadowed
            coordinateSchema: options.coordinateSchema || 'letters-numbers' // letters-numbers, numbers-only, chess-style
        };
        
        this.metadata = null;
        this.cellWidth = 0;
        this.cellHeight = 0;
        this.totalWidth = 0;
        this.totalHeight = 0;
    }

    /**
     * Initialize the system and load image metadata
     */
    async initialize() {
        this.metadata = await sharp(this.imagePath).metadata();
        
        // No longer require square image - support rectangular grids
        
        this.cellWidth = this.metadata.width / this.options.gridWidth;
        this.cellHeight = this.metadata.height / this.options.gridHeight;
        this.totalWidth = this.metadata.width + (this.options.borderSize * 2);
        this.totalHeight = this.metadata.height + (this.options.borderSize * 2);
        
        console.log(`✅ Initialized grid system for ${this.metadata.width}x${this.metadata.height} image`);
        console.log(`   Grid: ${this.options.gridWidth}x${this.options.gridHeight}, Cell size: ${Math.round(this.cellWidth)}x${Math.round(this.cellHeight)}px`);
    }

    /**
     * Get the coordinate label for a given grid position
     */
    getCoordinateLabel(x, y) {
        switch (this.options.coordinateSchema) {
            case 'numbers-only':
                return `${x + 1}-${y + 1}`;
            case 'chess-style':
                return `${String.fromCharCode(97 + x)}${y + 1}`;
            case 'letters-numbers':
            default:
                // Support Excel-style columns for wide grids
                let column = '';
                let colIndex = x;
                while (colIndex >= 0) {
                    column = String.fromCharCode(65 + (colIndex % 26)) + column;
                    colIndex = Math.floor(colIndex / 26) - 1;
                }
                return `${column}${y + 1}`;
        }
    }

    /**
     * Convert coordinate label to grid position
     */
    parseCoordinate(label) {
        const upperLabel = label.toUpperCase();
        
        switch (this.options.coordinateSchema) {
            case 'numbers-only':
                const [x, y] = label.split('-').map(n => parseInt(n) - 1);
                return { x, y };
            case 'chess-style':
                const chessX = upperLabel.charCodeAt(0) - 65;
                const chessY = parseInt(upperLabel.slice(1)) - 1;
                return { x: chessX, y: chessY };
            case 'letters-numbers':
            default:
                // Parse Excel-style columns (A, Z, AA, AB, etc.)
                let colIndex = 0;
                let colPart = upperLabel.match(/^[A-Z]+/)[0];
                let rowPart = upperLabel.match(/\d+$/)[0];
                
                // Convert column letters to index
                for (let i = 0; i < colPart.length; i++) {
                    colIndex = colIndex * 26 + (colPart.charCodeAt(i) - 65 + 1);
                }
                colIndex -= 1; // Convert to 0-based index
                
                const rowIndex = parseInt(rowPart) - 1;
                return { x: colIndex, y: rowIndex };
        }
    }

    /**
     * Get pixel coordinates for a grid cell (relative to the map, not including border)
     */
    getCellPixelCoordinates(gridX, gridY) {
        return {
            x: gridX * this.cellWidth,
            y: gridY * this.cellHeight,
            width: this.cellWidth,
            height: this.cellHeight,
            centerX: (gridX * this.cellWidth) + (this.cellWidth / 2),
            centerY: (gridY * this.cellHeight) + (this.cellHeight / 2)
        };
    }

    /**
     * Get pixel coordinates for a grid cell (including border offset)
     */
    getCellPixelCoordinatesWithBorder(gridX, gridY) {
        const coords = this.getCellPixelCoordinates(gridX, gridY);
        return {
            ...coords,
            x: coords.x + this.options.borderSize,
            y: coords.y + this.options.borderSize,
            centerX: coords.centerX + this.options.borderSize,
            centerY: coords.centerY + this.options.borderSize
        };
    }

    /**
     * Generate the base grid overlay
     */
    async generateGridOverlay(outputPath) {
        if (!this.metadata) await this.initialize();
        
        const svg = this.generateGridSVG();
        const svgBuffer = Buffer.from(svg);
        
        await sharp(svgBuffer)
            .png()
            .toFile(outputPath);
            
        console.log(`✅ Generated grid overlay: ${outputPath}`);
        return outputPath;
    }

    /**
     * Generate SVG for the grid
     */
    generateGridSVG() {
        const { gridWidth, gridHeight, borderSize, lineWidth, fontSize, gridColor, borderColor } = this.options;
        
        return `
            <svg width="${this.totalWidth}" height="${this.totalHeight}" xmlns="http://www.w3.org/2000/svg">
                <!-- Background -->
                <rect width="${this.totalWidth}" height="${this.totalHeight}" fill="${borderColor}"/>
                
                <!-- Place map image -->
                <image href="file://${path.resolve(this.imagePath)}" 
                       x="${borderSize}" y="${borderSize}" 
                       width="${this.metadata.width}" height="${this.metadata.height}"/>
                
                <!-- Grid lines -->
                ${this.generateGridLines()}
                
                <!-- Coordinate labels -->
                ${this.generateCoordinateLabels()}
            </svg>
        `;
    }

    /**
     * Generate SVG overlay only (no background or embedded image)
     */
    generateGridOverlaySVG() {
        const { gridWidth, gridHeight, borderSize, lineWidth, fontSize, gridColor, borderColor } = this.options;
        
        return `
            <svg width="${this.totalWidth}" height="${this.totalHeight}" xmlns="http://www.w3.org/2000/svg">
                <!-- Transparent background for overlay -->
                <rect width="${this.totalWidth}" height="${this.totalHeight}" fill="transparent"/>
                
                <!-- Grid lines -->
                ${this.generateGridLines()}
                
                <!-- Coordinate labels with white background -->
                ${this.generateCoordinateLabels()}
            </svg>
        `;
    }

    /**
     * Generate grid lines SVG
     */
    generateGridLines() {
        const { gridWidth, gridHeight, borderSize, lineWidth, gridColor } = this.options;
        let lines = '';
        
        // Vertical lines
        for (let i = 0; i <= gridWidth; i++) {
            lines += `
                <line x1="${borderSize + (i * this.cellWidth)}" y1="${borderSize}" 
                      x2="${borderSize + (i * this.cellWidth)}" y2="${borderSize + this.metadata.height}" 
                      stroke="${gridColor}" stroke-width="${lineWidth}"/>
            `;
        }
        
        // Horizontal lines
        for (let i = 0; i <= gridHeight; i++) {
            lines += `
                <line x1="${borderSize}" y1="${borderSize + (i * this.cellHeight)}" 
                      x2="${borderSize + this.metadata.width}" y2="${borderSize + (i * this.cellHeight)}" 
                      stroke="${gridColor}" stroke-width="${lineWidth}"/>
            `;
        }
        
        return lines;
    }

    /**
     * Generate coordinate labels SVG
     */
    generateCoordinateLabels() {
        const { gridWidth, gridHeight, borderSize, fontSize, labelStyle } = this.options;
        let labels = '';
        
        // Column labels
        for (let i = 0; i < gridWidth; i++) {
            const colLabel = this.getCoordinateLabel(i, 0).split(/\d/)[0];
            
            // Column labels (top)
            if (labelStyle === 'boxed') {
                labels += `
                    <rect x="${borderSize + (i * this.cellWidth) + this.cellWidth/2 - 25}" 
                          y="${borderSize/2 - fontSize/2 - 5}" 
                          width="50" height="${fontSize + 10}" 
                          fill="white" stroke="black" stroke-width="1" rx="5"/>
                `;
            }
            
            labels += `
                <text x="${borderSize + (i * this.cellWidth) + this.cellWidth/2}" 
                      y="${borderSize/2 + fontSize/3}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black"
                      ${labelStyle === 'shadowed' ? 'filter="url(#dropshadow)"' : ''}>
                    ${colLabel}
                </text>
            `;
        }
        
        // Row labels
        for (let i = 0; i < gridHeight; i++) {
            const rowLabel = (i + 1).toString();
            
            // Row labels (left)
            if (labelStyle === 'boxed') {
                labels += `
                    <rect x="${borderSize/2 - 25}" 
                          y="${borderSize + (i * this.cellHeight) + this.cellHeight/2 - fontSize/2 - 5}" 
                          width="50" height="${fontSize + 10}" 
                          fill="white" stroke="black" stroke-width="1" rx="5"/>
                `;
            }
            
            labels += `
                <text x="${borderSize/2}" 
                      y="${borderSize + (i * this.cellHeight) + this.cellHeight/2 + fontSize/3}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black"
                      ${labelStyle === 'shadowed' ? 'filter="url(#dropshadow)"' : ''}>
                    ${rowLabel}
                </text>
            `;
        }
        
        // Add drop shadow filter if needed
        if (labelStyle === 'shadowed') {
            labels += `
                <defs>
                    <filter id="dropshadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                        <feOffset dx="2" dy="2" result="offsetblur"/>
                        <feComponentTransfer>
                            <feFuncA type="linear" slope="0.3"/>
                        </feComponentTransfer>
                        <feMerge> 
                            <feMergeNode/>
                            <feMergeNode in="SourceGraphic"/> 
                        </feMerge>
                    </filter>
                </defs>
            `;
        }
        
        return labels;
    }

    /**
     * Draw markers on specific grid cells
     */
    async drawOnCells(baseImagePath, markers, outputPath) {
        if (!this.metadata) await this.initialize();
        
        // Load the base image with grid
        let compositeOperations = [];
        
        // Create SVG overlay for markers
        const markersSVG = `
            <svg width="${this.totalWidth}" height="${this.totalHeight}" xmlns="http://www.w3.org/2000/svg">
                ${markers.map(marker => this.generateMarkerSVG(marker)).join('')}
            </svg>
        `;
        
        const markersBuffer = Buffer.from(markersSVG);
        
        // Composite the markers onto the base image
        await sharp(baseImagePath)
            .composite([{
                input: markersBuffer,
                top: 0,
                left: 0
            }])
            .toFile(outputPath);
            
        console.log(`✅ Added ${markers.length} markers to grid: ${outputPath}`);
        return outputPath;
    }

    /**
     * Generate SVG for a single marker
     */
    generateMarkerSVG(marker) {
        const { coordinate, type = 'circle', color = 'red', size = 20, label = '' } = marker;
        const pos = this.parseCoordinate(coordinate);
        const cellCoords = this.getCellPixelCoordinatesWithBorder(pos.x, pos.y);
        
        let svg = '';
        
        switch (type) {
            case 'circle':
                svg = `<circle cx="${cellCoords.centerX}" cy="${cellCoords.centerY}" 
                               r="${size}" fill="${color}" opacity="0.7"/>`;
                break;
            case 'square':
                svg = `<rect x="${cellCoords.centerX - size}" y="${cellCoords.centerY - size}" 
                             width="${size * 2}" height="${size * 2}" 
                             fill="${color}" opacity="0.7"/>`;
                break;
            case 'x':
                svg = `
                    <line x1="${cellCoords.centerX - size}" y1="${cellCoords.centerY - size}" 
                          x2="${cellCoords.centerX + size}" y2="${cellCoords.centerY + size}" 
                          stroke="${color}" stroke-width="4"/>
                    <line x1="${cellCoords.centerX - size}" y1="${cellCoords.centerY + size}" 
                          x2="${cellCoords.centerX + size}" y2="${cellCoords.centerY - size}" 
                          stroke="${color}" stroke-width="4"/>
                `;
                break;
            case 'highlight':
                svg = `<rect x="${cellCoords.x}" y="${cellCoords.y}" 
                             width="${cellCoords.width}" height="${cellCoords.height}" 
                             fill="${color}" opacity="0.3"/>`;
                break;
        }
        
        // Add label if provided
        if (label) {
            svg += `
                <text x="${cellCoords.centerX}" y="${cellCoords.centerY + 5}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="16" 
                      font-weight="bold" 
                      fill="white"
                      stroke="black" stroke-width="2" paint-order="stroke">
                    ${label}
                </text>
            `;
        }
        
        return svg;
    }
}

// Example usage and testing
async function testMapGridSystem() {
    console.log('🧪 Testing MapGridSystem...\n');
    
    // Test 1: Basic grid generation
    const grid1 = new MapGridSystem('./img/map.png', {
        gridSize: 10,
        borderSize: 80,
        labelStyle: 'standard'
    });
    await grid1.generateGridOverlay('./img/test_grid_basic.png');
    
    // Test 2: Different coordinate schema
    const grid2 = new MapGridSystem('./img/map.png', {
        gridSize: 8,
        borderSize: 100,
        coordinateSchema: 'chess-style',
        labelStyle: 'boxed',
        fontSize: 42
    });
    await grid2.generateGridOverlay('./img/test_grid_chess.png');
    
    // Test 3: Add markers to grid
    await grid1.initialize();
    const markers = [
        { coordinate: 'A1', type: 'circle', color: 'red', size: 30 },
        { coordinate: 'E5', type: 'square', color: 'blue', size: 25 },
        { coordinate: 'J10', type: 'x', color: 'green', size: 20 },
        { coordinate: 'C7', type: 'highlight', color: 'yellow' },
        { coordinate: 'F3', type: 'circle', color: 'purple', size: 20, label: 'Base' }
    ];
    await grid1.drawOnCells('./img/test_grid_basic.png', markers, './img/test_grid_with_markers.png');
    
    // Test 4: Demonstrate coordinate conversion
    console.log('\n📍 Coordinate conversion examples:');
    const testCoords = ['A1', 'E5', 'J10'];
    for (const coord of testCoords) {
        const pos = grid1.parseCoordinate(coord);
        const pixels = grid1.getCellPixelCoordinates(pos.x, pos.y);
        console.log(`   ${coord} → Grid(${pos.x},${pos.y}) → Pixels(${Math.round(pixels.x)},${Math.round(pixels.y)})`);
    }
    
    console.log('\n✅ All tests completed!');
}

// Run tests if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
    testMapGridSystem().catch(console.error);
}

export default MapGridSystem;