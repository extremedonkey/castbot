import sharp from 'sharp';

async function applyGridToMapFixed() {
    console.log('🗺️ Applying grids to map.png (fixed version)...\n');
    
    const mapPath = './img/map.png';
    const mapMetadata = await sharp(mapPath).metadata();
    
    // Version 1: 10x10 grid
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 10,
        borderSize: 80,
        lineWidth: 3,
        fontSize: 40,
        outputPath: './img/map_grid_10x10_fixed.png'
    });
    
    // Version 2: 8x8 grid (like example)
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 8,
        borderSize: 60,
        lineWidth: 3,
        fontSize: 40,
        outputPath: './img/map_grid_8x8_fixed.png'
    });
    
    // Version 3: 5x5 coarse grid
    await createGridOverlay(mapPath, mapMetadata, {
        gridSize: 5,
        borderSize: 100,
        lineWidth: 4,
        fontSize: 48,
        outputPath: './img/map_grid_5x5_fixed.png'
    });
    
    console.log('\n✅ Fixed grids created!');
}

async function createGridOverlay(mapPath, mapMetadata, options) {
    const { gridSize, borderSize, lineWidth, fontSize, outputPath } = options;
    
    const newWidth = mapMetadata.width + (borderSize * 2);
    const newHeight = mapMetadata.height + (borderSize * 2);
    const cellWidth = mapMetadata.width / gridSize;
    const cellHeight = mapMetadata.height / gridSize;
    
    // Create white background
    const background = await sharp({
        create: {
            width: newWidth,
            height: newHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
    }).png().toBuffer();
    
    // Create grid overlay SVG
    const gridSVG = `
        <svg width="${newWidth}" height="${newHeight}" xmlns="http://www.w3.org/2000/svg">
            <!-- Grid lines (vertical) -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize + (i * cellWidth)}" y1="${borderSize}" 
                      x2="${borderSize + (i * cellWidth)}" y2="${borderSize + mapMetadata.height}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            <!-- Grid lines (horizontal) -->
            ${Array.from({ length: gridSize + 1 }, (_, i) => `
                <line x1="${borderSize}" y1="${borderSize + (i * cellHeight)}" 
                      x2="${borderSize + mapMetadata.width}" y2="${borderSize + (i * cellHeight)}" 
                      stroke="black" stroke-width="${lineWidth}"/>
            `).join('')}
            
            <!-- Column labels -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize + (i * cellWidth) + (cellWidth / 2)}" 
                      y="${borderSize / 2 + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${String.fromCharCode(65 + i)}
                </text>
            `).join('')}
            
            <!-- Row labels -->
            ${Array.from({ length: gridSize }, (_, i) => `
                <text x="${borderSize / 2}" 
                      y="${borderSize + (i * cellHeight) + (cellHeight / 2) + fontSize / 3}" 
                      text-anchor="middle" 
                      font-family="Arial" 
                      font-size="${fontSize}" 
                      font-weight="bold" 
                      fill="black">
                    ${i + 1}
                </text>
            `).join('')}
        </svg>
    `;
    
    const gridBuffer = Buffer.from(gridSVG);
    
    // Composite: background -> map -> grid
    await sharp(background)
        .composite([
            {
                input: mapPath,
                top: borderSize,
                left: borderSize
            },
            {
                input: gridBuffer,
                top: 0,
                left: 0
            }
        ])
        .toFile(outputPath);
        
    console.log(`✅ Created ${outputPath}`);
}

// Run it!
applyGridToMapFixed().catch(console.error);