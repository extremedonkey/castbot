import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

async function overlayGridOnMap() {
    console.log('🗺️ Starting grid overlay test...');
    
    const mapPath = './img/map.png';
    const gridPath = './img/grid.png';
    const outputPath = './img/gridmap1.png';
    
    try {
        // Get metadata for both images
        const mapMetadata = await sharp(mapPath).metadata();
        const gridMetadata = await sharp(gridPath).metadata();
        
        console.log('Map dimensions:', mapMetadata.width, 'x', mapMetadata.height);
        console.log('Grid dimensions:', gridMetadata.width, 'x', gridMetadata.height);
        
        // Resize grid to match map dimensions
        const resizedGrid = await sharp(gridPath)
            .resize(mapMetadata.width, mapMetadata.height, {
                fit: 'fill', // Stretch to fill exact dimensions
                position: 'center'
            })
            .toBuffer();
        
        // Overlay grid on map
        const result = await sharp(mapPath)
            .composite([{
                input: resizedGrid,
                blend: 'over',
                opacity: 0.7 // Make grid semi-transparent
            }])
            .toFile(outputPath);
            
        console.log('✅ Created gridmap1.png');
        
        // Try different opacity levels
        for (let i = 2; i <= 5; i++) {
            const opacity = 0.3 + (i - 2) * 0.2; // 0.3, 0.5, 0.7, 0.9
            
            await sharp(mapPath)
                .composite([{
                    input: resizedGrid,
                    blend: 'over',
                    opacity: opacity
                }])
                .toFile(`./img/gridmap${i}.png`);
                
            console.log(`✅ Created gridmap${i}.png with opacity ${opacity}`);
        }
        
        // Try different blend modes
        const blendModes = ['multiply', 'screen', 'overlay', 'hard-light'];
        for (let i = 0; i < blendModes.length; i++) {
            await sharp(mapPath)
                .composite([{
                    input: resizedGrid,
                    blend: blendModes[i],
                    opacity: 0.8
                }])
                .toFile(`./img/gridmap_${blendModes[i]}.png`);
                
            console.log(`✅ Created gridmap_${blendModes[i]}.png`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run the test
overlayGridOnMap();