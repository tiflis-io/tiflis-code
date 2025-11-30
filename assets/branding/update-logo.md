# Update Logo PNG Assets

This command regenerates all PNG logo assets from the updated SVG logo for iOS and watchOS apps.

## Source
- **SVG File**: `assets/branding/logo.svg` (new optimized version)
- **Features**: Solid colors (no opacity), optimized structure, repositioned arrow

## Target Locations
- **iOS App**: `apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/`
- **Files to replace**:
  - `TiflisLogo.png` (1x - 80x80px)
  - `TiflisLogo@2x.png` (2x - 160x160px) 
  - `TiflisLogo@3x.png` (3x - 240x240px)

## Generation Commands

### Using rsvg-convert (recommended)
```bash
cd assets/branding/

# Generate 1x size (80x80)
rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo.png

# Generate 2x size (160x160)
rsvg-convert -w 160 -h 160 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@2x.png

# Generate 3x size (240x240)
rsvg-convert -w 240 -h 240 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@3x.png
```

### Using ImageMagick (alternative)
```bash
cd assets/branding/

# Generate all sizes with high DPI
convert -background transparent -density 300 -resize 80x80 logo.svg ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo.png
convert -background transparent -density 300 -resize 160x160 logo.svg ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@2x.png
convert -background transparent -density 300 -resize 240x240 logo.svg ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@3x.png
```

## Quality Requirements
- **Transparency**: Maintain transparent background for rounded corners
- **Anti-aliasing**: Enable smooth edges for high-quality rendering
- **Color accuracy**: Preserve exact colors from SVG (#2E5AA6, #6F4ABF, #111, #fff)
- **Compression**: Use lossless PNG compression for best quality

## Verification Steps
1. **Xcode Preview**: Open Assets.xcassets in Xcode to verify proper display
2. **Simulator Testing**: Test on iOS Simulator (iPhone 16 Pro recommended)
3. **Device Testing**: Test on actual iOS device if available
4. **Background Testing**: Verify appearance on both light and dark backgrounds
5. **Scaling Test**: Check sharpness at different screen densities
6. **Accessibility**: Ensure VoiceOver reads alt text correctly

## Additional Considerations
- **WatchOS**: Currently shares same TiflisLogo assets with iOS app
- **App Icons**: Separate from logo - may need separate update process
- **Color Consistency**: New solid colors should match across all platforms
- **Version Control**: Commit PNG changes after successful testing

## Troubleshooting
- **Blurry edges**: Increase DPI setting or enable anti-aliasing
- **Color shift**: Ensure color profile is maintained during conversion
- **Transparency issues**: Verify background is properly set to transparent
- **Size mismatch**: Double-check pixel dimensions match expected sizes

## Automation
This process can be automated in CI/CD pipeline when logo.svg changes are detected:
```bash
# Script for automated updates
if git diff --name-only HEAD~1 HEAD | grep "assets/branding/logo.svg"; then
    echo "Logo updated, regenerating PNG assets..."
    # Run conversion commands
    git add apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/*.png
fi
```