# Privacy

**Nothing you attach to MASH-Mix leaves your machine.**

The extension has no analytics, no telemetry, no vendor server and no remote
code. There is no account, no sign in and no identifier.

## What the extension measures

When you attach a file, the browser decodes it and the extension measures it
in the page itself: the peak, the average level, the integrated loudness, the
clipped samples, the dc offset, the silence at the head, the crest factor, the
key of the song and its tempo. Those numbers are written into the panel and
they are not sent anywhere. They are not stored either: they live in the panel
until you close it.

## What the extension sends

Only if you press **Get the lyrics**, and only to the local engine you set in
the settings, which is a server on this machine:

- the file you attached,
- the language and the output script you chose.

**Speak the lyrics** sends the lyric text to the same local engine. Nothing
else is sent, and no other host is ever contacted.

## What happens when you paste a link

When you press **Fetch from the link**, the extension sends the address you
pasted to the local engine, and nothing else. The browser never visits the
site.

The engine on this machine is then the one that visits it, the way any
downloader does. The audio is written to a folder on this machine and the
lyrics are written next to it. The site you named sees your address the way
it would see the address of any visitor, and the engine talks to no vendor,
no telemetry service and no account service.

The panel then plays the copy of the audio that the engine put on this
machine, by asking the engine on this machine for it. Nothing is sent to the
site by the panel, and nothing about the song is sent anywhere off this
machine.

The permissions of the extension do not change when a link is used. The
extension can still only reach `127.0.0.1` and `localhost`.

## The permissions and why they are there

| Permission | Why |
|---|---|
| `storage` | Keeps the address of the local engine. It never leaves the browser profile. |
| `sidePanel` | Opens the panel when you press the toolbar button. |
| `http://127.0.0.1/*` and `http://localhost/*` | To reach the MASH-Mix engine running on this machine. It cannot reach the internet. |

The extension has no access to the pages you visit. It has no content script
and it reads nothing from any website.

## The engine

The MASH-Mix engine is a separate program that you run yourself. It loads
speech models and writes lyrics. It runs on your machine and it talks to no
vendor. See the privacy note of the engine for its own detail.

## The store

This extension is not published to the Chrome Web Store, so the store has no
copy of your data either. It is installed from the source in this repository,
as an unpacked extension.
