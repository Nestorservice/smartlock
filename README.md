# AegisLock

Application Android de sécurité avancée construite en React Native. AegisLock remplace l'écran de verrouillage classique par un système de déverrouillage dynamique piloté par une formule mathématique générée par intelligence artificielle (Google Gemini Pro).

---

## Table des matières

1. [Présentation du projet](#1-présentation-du-projet)
2. [Architecture](#2-architecture)
3. [Prérequis](#3-prérequis)
4. [Installation](#4-installation)
5. [Configuration des variables d'environnement](#5-configuration-des-variables-denvironnement)
6. [Configuration EmailJS](#6-configuration-emailjs)
7. [Build de l'APK](#7-build-de-lapk)
8. [Lancer en mode développement](#8-lancer-en-mode-développement)
9. [Fonctionnement détaillé](#9-fonctionnement-détaillé)
10. [Structure du projet](#10-structure-du-projet)
11. [Dépendances principales](#11-dépendances-principales)
12. [Permissions Android](#12-permissions-android)
13. [Problèmes courants](#13-problèmes-courants)

---

## 1. Présentation du projet

AegisLock est une application mobile Android à l'esthétique terminal militaire. Elle fonctionne en deux écrans distincts.

### Écran 1 — Terminal de configuration (`ConfigScreen`)

L'opérateur configure le comportement du verrou via un panneau de contrôle :

- **Formule de déverrouillage générée par IA** : l'opérateur décrit en langage naturel une règle (exemple : *"Le nombre de secousses doit être le double du jour de la semaine plus un"*). L'application envoie cette description à l'API **Gemini Pro** de Google, qui retourne une formule mathématique utilisant la variable `j` (jour de la semaine, 1=lundi à 7=dimanche). Exemple de résultat : `j * 2 + 1`.
- **Module DYNAMIC SHAKE** : active ou désactive le déverrouillage par secousses de l'accéléromètre.
- **Module BIOMETRIC AUTH** : active ou désactive le déverrouillage par empreinte digitale.
- **Max tentatives** : nombre maximum d'échecs autorisés avant de déclencher l'alerte d'intrusion (valeur entre 1 et 10).
- **Email d'alerte** : adresse email qui recevra le rapport d'intrusion automatiquement.

### Écran 2 — Écran de verrouillage (`LockScreen`)

Une fois activé, le verrou bloque toutes les interactions Android :

- Le bouton retour physique est désactivé.
- Le nombre de secousses requis est calculé en temps réel en évaluant la formule avec le jour de la semaine courant. Par exemple, si la formule est `j * 2 + 1` et qu'on est mercredi (j=3), il faut exactement **7 secousses** pour déverrouiller.
- Un anneau concentrique animé affiche la progression des secousses en temps réel.
- Si le module biométrique est activé, la lecture d'empreinte est également proposée.
- En cas de dépassement du nombre de tentatives autorisées :
  - La caméra frontale capture silencieusement une photo de l'intrus.
  - Le GPS récupère les coordonnées de l'appareil.
  - Un email d'alerte est envoyé via **EmailJS** contenant la photo, les coordonnées GPS et un lien Google Maps.

---

## 2. Architecture

```
App.js
├── NavigationContainer  (thème sombre, React Navigation)
│   └── Stack.Navigator
│       ├── ConfigScreen   ← écran initial
│       └── LockScreen     ← activé manuellement

src/
├── screens/
│   ├── ConfigScreen.js    ← panneau de configuration
│   └── LockScreen.js      ← verrou actif
├── services/
│   ├── GeminiService.js   ← traduction IA → formule (API Gemini)
│   ├── MathService.js     ← évaluation de la formule mathématique
│   ├── ShakeService.js    ← détection de secousses (accéléromètre)
│   └── SecurityService.js ← pipeline d'alerte d'intrusion
└── theme.js               ← design tokens (couleurs, typographie, espacements)
```

### Flux de données principal

```
[ConfigScreen]
  Opérateur saisit une instruction en langage naturel
          ↓
  GeminiService → API Gemini Pro → formule retournée (ex: "j * 2 + 1")
          ↓
  Formule sauvegardée dans AsyncStorage

[LockScreen — au démarrage]
  MathService.evaluateFormula(formule) avec j = jour actuel
          ↓
  Nombre de secousses requis calculé
          ↓
  ShakeService écoute l'accéléromètre en continu
          ↓
  Chaque secousse valide est comptée → count >= requis → déverrouillage

[LockScreen — en cas d'intrusion]
  Trop de tentatives échouées
          ↓
  SecurityService.triggerIntrusionAlert()
  ├── Photo frontale (react-native-vision-camera)
  ├── GPS (react-native-community/geolocation)
  └── Email via EmailJS REST API
```

---

## 3. Prérequis

Vérifier que les outils suivants sont installés **avant** de commencer.

### Outils système

| Outil | Version minimale | Comment vérifier |
|---|---|---|
| Node.js | 22.11.0 | `node --version` |
| npm | 10+ | `npm --version` |
| Java JDK | 17 | `java -version` |
| Android Studio | Ladybug ou plus récent | — |
| Git | Toute version récente | `git --version` |

### SDK Android (via Android Studio → SDK Manager)

Cocher et installer :

- **Android SDK Platform 36** (API level 36)
- **Android SDK Build-Tools 36.0.0**
- **NDK 27.1.12297006** (obligatoire — utilisé par les modules natifs C++)
- **CMake** (dernière version disponible dans la liste)

### Variables d'environnement système

**macOS / Linux** — ajouter dans `~/.bashrc` ou `~/.zshrc` :

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

**Windows** — via Paramètres système → Variables d'environnement :

- Créer `ANDROID_HOME` = `C:\Users\<votre-nom>\AppData\Local\Android\Sdk`
- Ajouter dans `PATH` : `%ANDROID_HOME%\platform-tools` et `%ANDROID_HOME%\emulator`

Après modification, redémarrer le terminal (ou l'ordinateur sur Windows).

---

## 4. Installation

### Étape 1 — Cloner le dépôt

```bash
git clone <url-du-repo>
cd TestApp
```

### Étape 2 — Installer les dépendances Node

```bash
npm install
```

> Le script `postinstall` s'exécute automatiquement après `npm install` pour appliquer les patches via `patch-package`.

### Étape 3 — Résoudre la limite MAX_PATH (Windows uniquement)

Windows limite les chemins à 260 caractères. Le compilateur natif Android (CMake/Ninja) génère des chemins très longs qui dépassent cette limite lorsque le projet est dans un dossier profondément imbriqué. La solution est de créer une **jonction Windows** (alias de dossier court) vers un chemin minimaliste.

**Ouvrir une invite de commandes (CMD) en tant qu'Administrateur**, puis exécuter :

```cmd
mklink /J C:\rn "C:\chemin\complet\vers\TestApp"
```

Remplacer `C:\chemin\complet\vers\TestApp` par le chemin réel du dossier sur votre machine.

À partir de ce moment, **tous les builds Gradle doivent être lancés depuis `C:\rn\android`** et non depuis le chemin original. La jonction pointe sur les mêmes fichiers, elle ne fait pas de copie.

> Cette étape n'est pas nécessaire sur macOS ou Linux.

### Étape 4 — Créer le fichier `.env`

```bash
cp .env.example .env
```

Puis remplir les valeurs (voir section suivante).

---

## 5. Configuration des variables d'environnement

Le fichier `.env` à la racine du projet contient les clés API. Il n'est **jamais commité dans Git** (présent dans `.gitignore`). Chaque développeur doit créer le sien.

```env
# Clé Google Gemini (génération de formules par IA)
GEMINI_API_KEY=votre_cle_gemini_ici

# EmailJS (envoi d'alertes d'intrusion)
EMAILJS_SERVICE_ID=service_xxxxxxx
EMAILJS_TEMPLATE_ID=template_xxxxxxx
EMAILJS_PUBLIC_KEY=votre_cle_publique_emailjs
```

### Obtenir la clé Gemini API

1. Aller sur **[Google AI Studio](https://aistudio.google.com/app/apikey)**
2. Se connecter avec un compte Google
3. Cliquer sur **"Create API key"**
4. Sélectionner ou créer un projet Google Cloud
5. Copier la clé générée → la coller dans `.env` à la place de `votre_cle_gemini_ici`

> Le quota gratuit est de 15 requêtes par minute et 1 500 par jour. Largement suffisant pour une utilisation normale.

### Obtenir les clés EmailJS

Voir la [section 6](#6-configuration-emailjs) ci-dessous.

---

## 6. Configuration EmailJS

EmailJS permet d'envoyer des emails directement depuis une application mobile, **sans backend**. La version gratuite offre 200 emails par mois.

### Étape 1 — Créer un compte EmailJS

Aller sur **[emailjs.com](https://www.emailjs.com)** et créer un compte gratuit.

### Étape 2 — Connecter un service email

1. Dashboard EmailJS → **Email Services** → **Add New Service**
2. Choisir un fournisseur (Gmail recommandé)
3. Suivre les instructions de connexion OAuth
4. Noter le **Service ID** (format `service_xxxxxxx`) → le coller dans `.env` comme valeur de `EMAILJS_SERVICE_ID`

### Étape 3 — Créer un template d'email

1. Dashboard → **Email Templates** → **Create New Template**
2. Remplir les champs :

**To Email** : `{{to_email}}`

**Subject** :
```
[AEGISLOCK] INTRUSION DÉTECTÉE — {{intrusion_time}}
```

**Corps HTML** (coller dans l'éditeur HTML) :
```html
<h2 style="color: #FF2D55;">⚠️ ALERTE INTRUSION — AEGISLOCK</h2>

<p>Une tentative d'intrusion a été détectée sur votre appareil.</p>

<table style="border-collapse: collapse; width: 100%;">
  <tr>
    <td style="padding: 8px; border: 1px solid #ccc;"><strong>Heure</strong></td>
    <td style="padding: 8px; border: 1px solid #ccc;">{{intrusion_time}}</td>
  </tr>
  <tr>
    <td style="padding: 8px; border: 1px solid #ccc;"><strong>Sévérité</strong></td>
    <td style="padding: 8px; border: 1px solid #ccc; color: #FF2D55;">{{severity}}</td>
  </tr>
  <tr>
    <td style="padding: 8px; border: 1px solid #ccc;"><strong>Localisation</strong></td>
    <td style="padding: 8px; border: 1px solid #ccc;">{{location_text}}</td>
  </tr>
  <tr>
    <td style="padding: 8px; border: 1px solid #ccc;"><strong>Lien Maps</strong></td>
    <td style="padding: 8px; border: 1px solid #ccc;">
      <a href="{{maps_link}}">Voir sur Google Maps</a>
    </td>
  </tr>
  <tr>
    <td style="padding: 8px; border: 1px solid #ccc;"><strong>Photo</strong></td>
    <td style="padding: 8px; border: 1px solid #ccc;">{{photo_info}}</td>
  </tr>
</table>
```

3. Sauvegarder le template
4. Noter le **Template ID** (format `template_xxxxxxx`) → le coller dans `.env` comme `EMAILJS_TEMPLATE_ID`

### Étape 4 — Récupérer la Public Key

1. Dashboard → **Account** → **General**
2. Copier la **Public Key** → la coller dans `.env` comme `EMAILJS_PUBLIC_KEY`

### Variables disponibles dans le template

| Variable | Contenu |
|---|---|
| `{{to_email}}` | Email du destinataire (configuré dans ConfigScreen) |
| `{{intrusion_time}}` | Horodatage UTC de l'intrusion |
| `{{severity}}` | Toujours `CRITICAL` |
| `{{latitude}}` | Latitude GPS (ou `N/A`) |
| `{{longitude}}` | Longitude GPS (ou `N/A`) |
| `{{location_text}}` | `"latitude, longitude"` formaté |
| `{{maps_link}}` | Lien Google Maps vers les coordonnées |
| `{{photo_info}}` | Chemin de la photo capturée (ou message d'indisponibilité) |

---

## 7. Build de l'APK

### Sur Windows (depuis la jonction)

```bash
cd C:\rn\android
./gradlew assembleRelease
```

### Sur macOS / Linux

```bash
cd android
./gradlew assembleRelease
```

### Localisation de l'APK généré

```
android/app/build/outputs/apk/release/app-release.apk
```

### Installer sur le téléphone

**Via ADB** (téléphone connecté en USB, débogage USB activé) :

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

**Manuellement** : transférer le fichier `.apk` sur le téléphone et l'ouvrir depuis l'explorateur de fichiers. Activer **"Sources inconnues"** (ou **"Installer des apps inconnues"**) dans les paramètres de sécurité Android si demandé.

---

## 8. Lancer en mode développement

Le mode développement permet de tester sans générer d'APK. Les modifications de code JavaScript sont rechargées instantanément (Fast Refresh).

### Étape 1 — Démarrer Metro (dans un terminal dédié)

```bash
npm start
```

Metro est le bundler JavaScript de React Native. Ce terminal doit rester ouvert pendant tout le développement.

### Étape 2 — Lancer l'app sur l'appareil

Avec un émulateur Android démarré dans Android Studio **ou** un téléphone branché en USB avec le débogage USB activé :

```bash
npm run android
```

### Déboguer avec React Native DevTools

En mode développement, secouer physiquement le téléphone (ou appuyer sur `m` dans le terminal Metro) pour ouvrir le menu développeur React Native, puis sélectionner **"Open DevTools"**. Les logs JS et les erreurs apparaissent dans le navigateur.

---

## 9. Fonctionnement détaillé

### GeminiService — Traduction IA vers formule

**Fichier :** `src/services/GeminiService.js`

Envoie une requête POST HTTPS à `generativelanguage.googleapis.com` (Gemini 1.5 Flash). Le payload contient un prompt système qui contraint le modèle à répondre **uniquement** avec une formule mathématique brute, sans texte ni explication. La réponse est validée par une regex (`/^[0-9j+\-*/^(). ]+$/`) avant d'être acceptée. En cas d'échec réseau, de timeout (15 secondes) ou de réponse invalide, la formule de repli `j` est retournée.

### MathService — Évaluation de la formule

**Fichier :** `src/services/MathService.js`

Utilise la bibliothèque `expr-eval` pour évaluer les formules mathématiques de manière sûre, **sans `eval()` JavaScript**. La variable `j` est substituée par le jour de la semaine courant selon la convention AegisLock (1=lundi, 7=dimanche). Le résultat est toujours un entier strictement positif, avec un minimum de 5 si le résultat calculé est 0.

| Exemple de formule | Lundi (j=1) | Mercredi (j=3) | Dimanche (j=7) |
|---|---|---|---|
| `j` | 1 → **5** (min) | 3 → **5** (min) | **7** |
| `j * 2 + 1` | **3** | **7** | **15** |
| `j ^ 2` | **1** → **5** (min) | **9** | **49** |

### ShakeService — Détection de secousses

**Fichier :** `src/services/ShakeService.js`

S'abonne au flux de l'accéléromètre via `react-native-sensors`. Applique un pipeline de filtrage à 3 étapes pour ne compter que les secousses intentionnelles :

1. **Filtre de magnitude** : seules les accélérations > 22 m/s² sont retenues. La marche (~10 m/s²) et la manipulation normale (~15 m/s²) sont ignorées.
2. **Filtre de cadence** : minimum 400ms entre deux secousses valides (élimine les oscillations d'un seul mouvement). Si plus de 1500ms séparent deux secousses, une nouvelle séquence commence et le compteur repart à zéro.
3. **Timeout d'inactivité** : si aucune secousse valide n'arrive pendant 3 secondes, le compteur est remis à zéro pour éviter l'accumulation entre sessions.

### SecurityService — Pipeline d'alerte d'intrusion

**Fichier :** `src/services/SecurityService.js`

Déclenché lorsque le nombre maximum de tentatives est dépassé. Exécute 4 étapes séquentielles :

1. **Email destinataire** : lu depuis AsyncStorage (configuré dans ConfigScreen)
2. **Photo frontale** : capturée via `react-native-vision-camera` (qualité rapide, flash désactivé, sans son)
3. **Position GPS** : obtenue via `react-native-community/geolocation` (haute précision, timeout 15s)
4. **Envoi de l'alerte** : POST vers l'API REST EmailJS avec toutes les informations collectées

Chaque étape est indépendante et ne bloque pas les suivantes en cas d'échec (dégradation gracieuse). Par exemple, si le GPS est refusé, l'email est quand même envoyé avec `N/A` comme position.

### Persistance des données

Toutes les configurations sont sauvegardées localement via `AsyncStorage` et persistent entre les sessions sans serveur.

| Clé AsyncStorage | Contenu |
|---|---|
| `formula` | La formule mathématique active |
| `shakeEnabled` | `"true"` ou `"false"` |
| `biometricsEnabled` | `"true"` ou `"false"` |
| `maxAttempts` | Nombre de tentatives max (chaîne de caractères) |
| `alertEmail` | Email d'alerte de l'opérateur |
| `lastInstruction` | Dernière instruction saisie dans ConfigScreen |

---

## 10. Structure du projet

```
TestApp/
├── android/                         ← projet Android natif
│   ├── app/
│   │   ├── build.gradle             ← config Gradle de l'app
│   │   └── src/main/
│   │       └── AndroidManifest.xml  ← permissions Android
│   └── build.gradle                 ← config Gradle racine
├── src/
│   ├── screens/
│   │   ├── ConfigScreen.js          ← panneau de configuration
│   │   └── LockScreen.js            ← écran de verrouillage actif
│   ├── services/
│   │   ├── GeminiService.js         ← appel API Gemini Pro
│   │   ├── MathService.js           ← évaluation de formules
│   │   ├── ShakeService.js          ← détection accéléromètre
│   │   └── SecurityService.js       ← alerte intrusion (email + GPS + photo)
│   └── theme.js                     ← design tokens centralisés
├── App.js                           ← composant racine + navigation
├── babel.config.js                  ← configuration Babel
├── package.json                     ← dépendances et scripts npm
├── .env                             ← clés API (à créer manuellement, non commité)
└── .env.example                     ← modèle du fichier .env
```

---

## 11. Dépendances principales

| Bibliothèque | Version | Rôle |
|---|---|---|
| `react-native` | 0.85.2 | Framework mobile |
| `@react-navigation/native-stack` | ^7.3.0 | Navigation entre les deux écrans |
| `react-native-config` | ^1.6.1 | Lecture du fichier `.env` dans le code JS natif |
| `react-native-biometrics` | ^3.0.1 | Authentification par empreinte digitale |
| `react-native-vision-camera` | ^4.6.0 | Capture photo via la caméra frontale |
| `react-native-sensors` | ^7.3.6 | Accès à l'accéléromètre |
| `@react-native-community/geolocation` | ^3.4.0 | Position GPS |
| `@react-native-async-storage/async-storage` | ^2.1.0 | Stockage local persistant |
| `expr-eval` | ^2.0.2 | Évaluation sécurisée de formules mathématiques |
| `react-native-safe-area-context` | ^5.5.2 | Gestion des zones sécurisées (notch, barre de navigation) |
| `react-native-screens` | ^4.10.0 | Optimisation native des écrans de navigation |

---

## 12. Permissions Android

Déclarées dans `android/app/src/main/AndroidManifest.xml` :

| Permission | Pourquoi |
|---|---|
| `INTERNET` | Appels API Gemini Pro et EmailJS |
| `USE_BIOMETRIC` | Authentification par empreinte digitale |
| `USE_FINGERPRINT` | Compatibilité anciens appareils |
| `CAMERA` | Capture photo de l'intrus (caméra frontale) |
| `ACCESS_FINE_LOCATION` | Coordonnées GPS précises pour l'alerte |
| `SYSTEM_ALERT_WINDOW` | Superposition de l'écran de verrouillage par-dessus d'autres apps |
| `EXPAND_STATUS_BAR` | Gestion de la barre de statut pendant le verrouillage |

---

## 13. Problèmes courants

### Build Gradle échoue avec "Filename longer than 260 characters" (Windows)

Créer la jonction Windows décrite à l'[Étape 3 de l'installation](#étape-3--résoudre-la-limite-max_path-windows-uniquement) et lancer tous les builds depuis `C:\rn\android` et non depuis le chemin original.

### "Network request failed" lors de l'appel Gemini

Vérifier que `manifestPlaceholders = [usesCleartextTraffic: "false"]` est présent dans le bloc `defaultConfig` de `android/app/build.gradle`. Sans ce placeholder, Android laisse une valeur invalide dans le manifeste et peut bloquer toutes les connexions réseau de l'application.

### L'appel Gemini réussit mais retourne toujours la formule `j`

La formule `j` est la valeur de repli retournée en cas d'échec. Vérifier :
1. Que `GEMINI_API_KEY` dans `.env` est valide et non expirée
2. Que le téléphone a accès à Internet
3. Les logs dans React Native DevTools (rechercher `[GeminiService]`) pour le message d'erreur exact

### La biométrie ne se déclenche pas

Le module biométrique nécessite :
1. Une empreinte digitale enregistrée dans les paramètres Android du téléphone
2. Le module **BIOMETRIC AUTH** activé (switch ON) dans ConfigScreen **avant** d'appuyer sur ACTIVATE LOCK

### L'email d'alerte n'est pas reçu

Vérifier dans l'ordre :
1. Les trois variables EmailJS (`SERVICE_ID`, `TEMPLATE_ID`, `PUBLIC_KEY`) sont correctement définies dans `.env`
2. Le service email est connecté dans le dashboard EmailJS (il peut expirer si OAuth est révoqué)
3. Le template EmailJS contient bien les variables `{{to_email}}`, `{{intrusion_time}}`, etc.
4. Vérifier le dossier Spam du destinataire

### Le build plante avec "Cannot lock file hash cache"

Un daemon Gradle est resté bloqué. L'arrêter puis relancer le build :

```bash
./gradlew --stop
./gradlew assembleRelease
```
