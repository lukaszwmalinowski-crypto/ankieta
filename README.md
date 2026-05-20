# Ankieta Erasmus+ Kalamata 2026

Statyczna aplikacja PWA do anonimowej ankiety ewaluacyjnej mobilności kadry Erasmus+ w Kalamacie. Działa na telefonach, zapisuje roboczo odpowiedzi w przeglądarce, działa offline po pierwszym uruchomieniu i generuje PDF z odpowiedziami.

## Pliki

- `index.html` - struktura aplikacji i formularz ankiety.
- `style.css` - wygląd responsywny na telefon i komputer.
- `app.js` - logika formularza, localStorage, PDF, PWA i wysyłki przez endpoint.
- `manifest.json` - konfiguracja instalacji PWA.
- `service-worker.js` - obsługa cache i trybu offline.
- `assets/logoebg.png` - logo projektu w nagłówku aplikacji.
- `icons/` - ikony aplikacji.
- `vendor/pdfmake/` - lokalna biblioteka do generowania estetycznych PDF z polskimi znakami.

## Publikacja na GitHub Pages

1. Utwórz nowe repozytorium na GitHubie, np. `ankieta-erasmus-kalamata-2026`.
2. Wgraj do repozytorium wszystkie pliki z tego katalogu.
3. Wejdź w `Settings` -> `Pages`.
4. W sekcji `Build and deployment` wybierz:
   - `Source`: `Deploy from a branch`,
   - `Branch`: `main`,
   - folder: `/root`.
5. Zapisz ustawienia i poczekaj, aż GitHub opublikuje stronę.
6. Otwórz adres podany przez GitHub Pages.

## Instalacja PWA na telefonie

Na Androidzie:

1. Otwórz opublikowaną stronę w Chrome.
2. W menu przeglądarki wybierz `Dodaj do ekranu głównego` albo użyj przycisku `Instaluj PWA`, jeśli przeglądarka go pokaże.
3. Aplikacja pojawi się na ekranie głównym telefonu.

Na iPhonie:

1. Otwórz stronę w Safari.
2. Kliknij ikonę udostępniania.
3. Wybierz `Do ekranu początkowego`.
4. Potwierdź dodanie aplikacji.

## Generowanie PDF

Po wypełnieniu wymaganych pól kliknij `Pobierz PDF`. Nazwa pliku ma format:

```text
ankieta_erasmus_kalamata_2026_[temat]_[data].pdf
```

PDF zawiera tytuł ankiety, datę wygenerowania, temat szkolenia, wszystkie odpowiedzi oraz średnią ocenę z pytań zamkniętych.

## Podłączenie wysyłki PDF

GitHub Pages jest hostingiem statycznym, więc sama strona nie wysyła maili bez zewnętrznego backendu. W pierwszej wersji przycisk `Wyślij PDF do koordynatora` pokazuje komunikat, że automatyczna wysyłka nie jest skonfigurowana.

Aby później podłączyć wysyłkę przez Supabase, Google Apps Script, EmailJS albo własne API:

1. Otwórz `app.js`.
2. Znajdź linię:

```js
const SEND_ENDPOINT = "";
```

3. Wpisz adres endpointu:

```js
const SEND_ENDPOINT = "https://twoj-endpoint.example.com/send";
```

4. Endpoint powinien przyjmować żądanie `POST` z JSON:

```json
{
  "recipient": "lukasz.w.malinowski@gmail.com",
  "subject": "Ankieta ewaluacyjna mobilności Erasmus+ - Kalamata 2026",
  "pdfBase64": "...",
  "formData": {}
}
```

5. Po wdrożeniu endpointu opublikuj ponownie plik `app.js` na GitHubie.

## Uwagi

Biblioteka pdfmake jest dołączona lokalnie w katalogu `vendor/pdfmake`. Po pierwszym otwarciu aplikacji service worker zapisuje ją w cache, aby generowanie PDF działało także offline.
