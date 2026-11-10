# Fichero Studio PRO (Web Bluetooth A4 Thermal Printer)

Zaawansowane, lekkie i w 100% niezależne studio druku termicznego A4 dla drukarek **Fichero 6181** (oraz kompatybilnych AiYin / PeriPage A4).

Aplikacja wykonana w **czystym Vanilla JS (HTML5 + CSS3 + ES6 Modules)** – **bez Node.js, bez NPM, bez instalowania aplikacji ze sklepu i bez sterowników**. Działa bezpośrednio w przeglądarce na telefonie i komputerze przez **Web Bluetooth API**.

---

## 🚀 Kluczowe Możliwości

### 1. Bezpośrednia łączność Web Bluetooth (BLE)
* Działa w 100% po stronie przeglądarki na telefonie (**Chrome, Edge, Samsung Internet, Opera**) i komputerze.
* Wykrywa i łączy się z urządzeniem rozgłaszającym się jako `FICHERO_6181_BLE`.
* Odczyt stanu baterii w czasie rzeczywistym oraz statusu sprzętowego (otwarta pokrywa, brak papieru, przegrzanie).

### 2. Zaawansowany Silnik Ditheringu i Efektów (w czasie rzeczywistym)
* **Artystyczne & Fotografie:**
  * **Atkinson** (kultowy algorytm MacPaint / HyperCard – czyste, ostre kropki, nie rozlewa czerni na papierze termicznym!)
  * **Floyd-Steinberg** (klasyczne rozpraszanie błędu)
  * **Stucki** (macierz 48-dzielnikowa – ekstremalna szczegółowość)
  * **Burkes** & **Sierra-3**
* **Geometryczne & Raster Prasowy:**
  * **Bayer Ordered Dithering** (macierze 4x4 i 8x8)
  * **Halftone Dot Screen** (raster gazetowy z regulowaną wielkością punktu od 3 do 16 px)
* **Dokumenty & Tekst:**
  * **Otsu Adaptive Threshold** (automatyczne wyliczanie optymalnego progu odcięcia)
  * **Sobel Edge** (kontury / efekt szkicu ołówkiem)
  * **Prosty Próg (Threshold)** z suwakiem 0–255
* **Korekta obrazu:** Jasność, Kontrast, Gamma, Odwrócenie kolorów (Negatyw), Wyostrzanie (Sharpen), Obrót o 90°.

### 3. Pełna Kontrola Pola Roboczego i Papieru w Rolce
* **Szerokości głowicy:**
  * `A4 Standard (204 mm / 1632 punkty)` – natywna szerokość Fichero 6181
  * `A4 Pełna głowica (210 mm / 1680 punktów)`
  * `US Letter (216 mm / 1728 punktów)`
  * Węższe rolki z adapterem: `A5 (148 mm)`, `105 mm`, `80 mm`, `58 mm`
* **Tryb Rolki Ciągłej (Continuous Roll):** Drukujesz dokładnie tyle, ile zajmuje treść – bez marnowania 30 cm papieru!
* **Wyrównanie w podajniku:** Do lewej, do środka, do prawej.
* **Konfigurowalny margines wysuwu:** Automatyczny wysuw np. 20 mm, by treść wyszła poza listwę odcinającą (cutter bar).

### 4. Kontrola Tempa Wydruku (Pacing Engine)
* **Wielkość pakietu BLE:** 64 B, 128 B, 200 B (domyślny MTU), 244 B.
* **Opóźnienie między pakietami (Pacing delay):** Regulacja 5–80 ms (zapobiega gubieniu pakietów na telefonach i zapobiega przegrzewaniu głowicy).
* **Gęstość grzania (Density):** 0 (Jasny), 1 (Standardowy), 2 (Ciemny / Wyrazisty).
* **Liczba kopii:** 1 do 99.

### 5. Źródła Treści
* **Zdjęcia / Obrazy:** Wgrywanie z pamięci, zrobienie zdjęcia aparatem w telefonie, wklejanie ze schowka (Ctrl+V).
* **Dokumenty PDF:** Wbudowany wektorowy renderer z wyborem stron.
* **Generator Tekstu / Etykiet:** Edytor z justowaniem, pogrubieniem, rozmiarem fontu i ozdobną ramką.
* **Kody Kreskowe & QR:** Natychmiastowe generowanie kodów QR i kodów kreskowych Code128 o idealnej ostrości pikseli.
* **Rysowanie & Podpis:** Dotykowy pad do podpisu palcem lub rysikiem.
* **Wzorce Testowe:** Pasek 1.0 cm na czarno (kalibracja głowicy), linijka milimetrowa 1:1, gradient tonów, siatka marginesów.

---

## 🛠️ Jak Uruchomić Lokalnie?

Nie potrzebujesz żadnego procesu budowania! Wystarczy dowolny lokalny serwer HTTP (wymagany przez przeglądarki dla modułów ES6):

### Opcja A (Python - jeśli masz Pythona):
```bash
python -m http.server 8000
```
Otwórz w przeglądarce: `http://localhost:8000`

### Opcja B (VS Code):
Zainstaluj rozszerzenie **Live Server** i kliknij "Go Live".

---

## 📱 Dostęp z Telefonu przez HTTPS (GitHub Pages)

Ponieważ przeglądarki wymagają protokołu **HTTPS** do obsługi Web Bluetooth na urządzeniach mobilnych, najwygodniej jest uruchomić stronę przez **GitHub Pages**:

1. Wypchnij kod do repozytorium GitHub:
   ```bash
   git add .
   git commit -m "Initial Fichero Studio PRO release"
   git push -u origin main
   ```
2. W ustawieniach repozytorium: `Settings` -> `Pages` -> Source: `GitHub Actions` (lub `Deploy from a branch` -> `main` / root).
3. Otwórz wygenerowany adres HTTPS na telefonie w Google Chrome!
4. Kliknij w menu przeglądarki **„Dodaj do ekranu głównego”**, aby zainstalować jako pełnoprawną aplikację mobilną PWA.

---

## 📄 Licencja
MIT
