import sharp from 'sharp';

async function addCoordinateLabels(gridBuffer, width, height, gridSize = 10) {
    // For now, just return the grid as-is since we're using sharp
    // In a full implementation, we'd use node-canvas to add text labels
    return gridBuffer;
}

async function createEnhancedGridOverlays() {
    console.log('🎨 Creating enhanced grid overlays...');
    
    const mapPath = './img/map.png';
    const gridPath = './img/grid.png';
    
    try {
        // Get metadata
        const mapMetadata = await sharp(mapPath).metadata();
        const gridMetadata = await sharp(gridPath).metadata();
        
        console.log('Map:', mapMetadata.width, 'x', mapMetadata.height);
        console.log('Grid:', gridMetadata.width, 'x', gridMetadata.height);
        
        // Test 1: Grid with tint color (blue-ish)
        const tintedGrid = await sharp(gridPath)
            .resize(mapMetadata.width, mapMetadata.height, { fit: 'fill' })
            .tint({ r: 100, g: 100, b: 255 })
            .toBuffer();
            
        await sharp(mapPath)
            .composite([{
                input: tintedGrid,
                blend: 'over',
                opacity: 0.5
            }])
            .toFile('./img/gridmap_tinted.png');
        console.log('✅ Created gridmap_tinted.png');
        
        // Test 2: Grid with different aspect ratio preservation
        const aspectGrid = await sharp(gridPath)
            .resize(mapMetadata.width, mapMetadata.height, { 
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toBuffer();
            
        await sharp(mapPath)
            .composite([{
                input: aspectGrid,
                blend: 'over',
                opacity: 0.7
            }])
            .toFile('./img/gridmap_aspect.png');
        console.log('✅ Created gridmap_aspect.png');
        
        // Test 3: Extract just the grid lines (assuming dark grid on light background)
        const extractedGrid = await sharp(gridPath)
            .resize(mapMetadata.width, mapMetadata.height, { fit: 'fill' })
            .negate() // Invert colors
            .threshold(200) // Make it black and white
            .negate() // Invert back
            .toBuffer();
            
        await sharp(mapPath)
            .composite([{
                input: extractedGrid,
                blend: 'multiply',
                opacity: 0.8
            }])
            .toFile('./img/gridmap_extracted.png');
        console.log('✅ Created gridmap_extracted.png');
        
        // Test 4: Create a custom grid programmatically
        const gridCount = 10;
        const cellWidth = Math.floor(mapMetadata.width / gridCount);
        const cellHeight = Math.floor(mapMetadata.height / gridCount);
        
        // Create SVG grid
        const svgGrid = `
            <svg width="${mapMetadata.width}" height="${mapMetadata.height}">
                <defs>
                    <pattern id="grid" width="${cellWidth}" height="${cellHeight}" patternUnits="userSpaceOnUse">
                        <rect width="${cellWidth}" height="${cellHeight}" fill="none" stroke="white" stroke-width="2" opacity="0.8"/>
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                ${Array.from({ length: gridCount }, (_, i) => `
                    <text x="${i * cellWidth + cellWidth/2}" y="30" text-anchor="middle" 
                          fill="white" font-size="24" font-weight="bold" 
                          stroke="black" stroke-width="2">
                        ${String.fromCharCode(65 + i)}
                    </text>
                `).join('')}
                ${Array.from({ length: gridCount }, (_, i) => `
                    <text x="30" y="${i * cellHeight + cellHeight/2}" text-anchor="middle" 
                          fill="white" font-size="24" font-weight="bold"
                          stroke="black" stroke-width="2">
                        ${i + 1}
                    </text>
                `).join('')}
            </svg>
        `;
        
        const svgBuffer = Buffer.from(svgGrid);
        
        await sharp(mapPath)
            .composite([{
                input: svgBuffer,
                blend: 'over'
            }])
            .toFile('./img/gridmap_svg.png');
        console.log('✅ Created gridmap_svg.png with coordinate labels');
        
        // Test 5: Different grid sizes
        for (const size of [5, 15, 20]) {
            const cellW = Math.floor(mapMetadata.width / size);
            const cellH = Math.floor(mapMetadata.height / size);
            
            const sizeGrid = `
                <svg width="${mapMetadata.width}" height="${mapMetadata.height}">
                    <defs>
                        <pattern id="grid${size}" width="${cellW}" height="${cellH}" patternUnits="userSpaceOnUse">
                            <rect width="${cellW}" height="${cellH}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid${size})" />
                </svg>
            `;
            
            await sharp(mapPath)
                .composite([{
                    input: Buffer.from(sizeGrid),
                    blend: 'over'
                }])
                .toFile(`./img/gridmap_${size}x${size}.png`);
            console.log(`✅ Created gridmap_${size}x${size}.png`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

createEnhancedGridOverlays();