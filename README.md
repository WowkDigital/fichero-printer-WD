# Fichero Studio PRO (Web Bluetooth A4 Thermal Printer)

An advanced, lightweight, and 100% client-side A4 thermal printing studio for **Fichero 6181** (and compatible AiYin / PeriPage A4 portable thermal printers).

Built entirely in **pure Vanilla JS (HTML5 + CSS3 + ES6 Modules)** — **no Node.js runtime, no NPM packages, no app store downloads, and no proprietary drivers needed**. Runs directly in the browser on smartphones, tablets, and desktop computers via the **Web Bluetooth API**.

---

## 🚀 Key Features

### 1. Direct Web Bluetooth (BLE) Connectivity
* **100% Browser-Based**: Runs client-side in modern browsers (**Chrome, Edge, Samsung Internet, Opera**) on Android, macOS, Windows, Linux, and ChromeOS.
* **Auto-Discovery**: Scans and pairs with devices advertising as `FICHERO_6181_BLE` or service `0x18F0`.
* **Hardware Telemetry**: Real-time battery percentage monitoring and hardware status checks (cover open, paper out, head overheat).

### 2. Advanced Real-Time Dithering & Image Processing Engine
* **Artistic & Photographic Algorithms:**
  * **Atkinson**: The iconic MacPaint / HyperCard algorithm — clean, crisp dots that prevent thermal paper dot-gain / black muddying.
  * **Floyd-Steinberg**: Classic error diffusion dithering.
  * **Stucki**: 48-divisor error diffusion for ultra-high detail.
  * **Burkes** & **Sierra-3**: Fine-grained tonal reproduction.
* **Geometric & Halftone Screens:**
  * **Bayer Ordered Dithering**: 4×4 and 8×8 ordered threshold matrices.
  * **Halftone Dot Screen**: Authentic newspaper print raster with adjustable cell size (3–16 px).
* **Document & Line Art Thresholding:**
  * **Otsu Adaptive Threshold**: Automatic bimodal threshold calculation for text documents.
  * **Sobel Edge Detection**: Contour extraction and pencil-sketch outlines.
  * **Simple Threshold**: Manual cutoff slider (0–255).
* **Pre-Processing Controls**: Brightness, Contrast, Gamma correction, Color Inversion (Negative), 3×3 Laplacian Sharpening, and 90° Clockwise Rotation.
* **Live Split-View**: Side-by-side comparison between original and processed thermal output.

### 3. Precision Working Area & Continuous Roll Management
* **Printhead Width Presets:**
  * `A4 Standard (204 mm / 1632 dots)` — native Fichero 6181 width
  * `A4 Full Head (210 mm / 1680 dots)`
  * `US Letter (216 mm / 1728 dots)`
  * Narrower rolls with paper guides: `A5 (148 mm)`, `105 mm`, `80 mm`, `58 mm`
* **Continuous Roll Mode (`10 FF 84 02`)**: Prints only the exact height of your design — eliminating wasted 30 cm paper feeds associated with standard page-oriented drivers.
* **Paper Alignment**: Left, Center, or Right alignment within the paper feed slot.
* **Custom Feed After Print**: Configurable feed margin (e.g., 20 mm / 160 rows) to smoothly advance content past the manual serrated tear bar.

### 4. Pacing Engine & Printhead Protection
* **BLE Chunk Size**: Configurable packet sizes (64 B, 128 B, 200 B MTU, 244 B).
* **Pacing Delay**: Adjustable 5–80 ms throttle between packets to prevent BLE buffer overflow on mobile chipsets and avoid thermal head overheating.
* **Burn Density**: Selectable thermal heating level (0 = Light, 1 = Normal, 2 = High Density).
* **Multi-Copy Support**: Configurable copy count (1 to 99).

### 5. Multi-Source Content Studio
* **Images & Photos**: Local file picker, direct mobile camera capture, and clipboard paste (<kbd>Ctrl</kbd> + <kbd>V</kbd>).
* **Text & Labels**: Built-in typography engine with font scaling, auto-wrapping, bold styling, alignments, and decorative borders.
* **Barcodes & QR Codes**: Instant vector rendering of QR codes and Code 128 barcodes optimized for high-contrast thermal scanning.
* **Drawing & Signatures**: Touch- and stylus-friendly drawing canvas for digital signatures and quick sketches.
* **Calibration & Test Patterns**: Exact 1.0 cm solid black band (for head uniformity and mechanical step calibration), 1:1 millimeter ruler, step gradient, and margin alignment grid.

---

## 📐 Hardware Specifications (Fichero 6181)

| Parameter | Specification |
| :--- | :--- |
| **Print Method** | Direct Thermal Line Printing |
| **Resolution** | 203 DPI (8 dots/mm $\rightarrow$ 1 dot = 0.125 mm) |
| **Max Dot Width** | 1632 dots (204 mm) / 1680 dots (210 mm full head) |
| **Paper Compatibility** | Continuous A4 thermal roll (210 mm wide) or fold paper |
| **Bluetooth Protocol** | BLE (Bluetooth Low Energy) |
| **Service UUID** | `000018f0-0000-1000-8000-00805f9b34fb` |
| **Write Characteristic** | `00002af1-0000-1000-8000-00805f9b34fb` |
| **Notify Characteristic** | `00002af0-0000-1000-8000-00805f9b34fb` |

---

## 🛠️ How to Run Locally

Because this project is built using native browser ES6 modules, it must be served over HTTP/HTTPS rather than opened via `file://`. No build steps or package installations are required!

### Option A: Python HTTP Server
```bash
python -m http.server 8000
```
Then navigate to: `http://localhost:8000`

### Option B: Node.js (npx)
```bash
npx serve .
```

### Option C: VS Code Live Server
Right-click on `index.html` and click **"Open with Live Server"**.

---

## 📱 Mobile Access via HTTPS (GitHub Pages)

Web Bluetooth API requires a secure **HTTPS** origin when accessed from mobile devices. The easiest and fastest way to use Fichero Studio PRO on your phone is via **GitHub Pages**:

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Update Fichero Studio PRO"
   git push origin main
   ```
2. In your GitHub repository:
   * Go to **Settings** $\rightarrow$ **Pages**
   * Under **Build and deployment** $\rightarrow$ **Source**, choose **Deploy from a branch**
   * Select branch `main` and folder `/ (root)` $\rightarrow$ Click **Save**
3. Open your generated GitHub Pages HTTPS URL in **Google Chrome** on your smartphone.
4. Tap the browser menu and select **"Add to Home Screen"** to install it as an offline-ready Progressive Web App (PWA).

---

## 📄 License
MIT License. Created by WowkDigital.
