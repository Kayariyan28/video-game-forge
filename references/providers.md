# Providers: choosing image and video models

The skill is provider-agnostic. The agent finds what this session can use, recommends, and **the user decides**.

## 1. Find what's available
**MCP servers.** Search the session's tools (load deferred tools first if needed) for names or descriptions such as `generate_image`, `edit_image`, `text_to_image`, `generate_video`, `image_to_video`, `run_model`, `upscale`, `first_frame`, `last_frame`, `reference_image`. Note each server's:
- **cost model**: does it quote first, charge per second, or charge per image?
- **async pattern**: submit → poll/wait → URL.

**APIs.** Check *whether* common keys are set without printing them:

```bash
for k in FAL_KEY REPLICATE_API_TOKEN OPENAI_API_KEY GEMINI_API_KEY GOOGLE_API_KEY RUNWAYML_API_SECRET LUMAAI_API_KEY \
         KLING_ACCESS_KEY MINIMAX_API_KEY WAVESPEED_API_KEY STABILITY_API_KEY BFL_API_KEY DASHSCOPE_API_KEY ARK_API_KEY; do
  [ -n "${!k}" ] && echo "$k set"; done
```

If nothing is available, tell the user what's needed: one image model with reference-image support, and one image-to-video model. Offer to proceed once they connect an MCP server or export a key.

Then ask with AskUserQuestion, recommending first. Use separate questions for images and video, since they can come from different providers.

## 2. Capabilities checklist (what each phase needs)
| Need | Why | If missing |
|---|---|---|
| Image: **reference images** (2–4 refs) | Keyframes that keep the same characters and places | Generate keyframes as edits of one master image, or use character LoRA/IP-adapter models if the provider has them. Expect more drift; review harder |
| Image: 16:9 (or the game's aspect) at ≥1K | Keyframe = clip first frame | Generate larger and crop |
| Video: **image-to-video (first frame)** | Every clip starts from its approved keyframe | Required. Text-to-video loses consistency |
| Video: **last frame** | Seamless idle loops (first = last) and clips that return to a pose | See loop fallbacks below |
| Video: 3–8 s durations | Short, responsive states | Trim longer clips; chain two for long cutscenes |
| Video: generated **audio** / speech | Footsteps, impacts, character lines | Generate silent; the engine score + SFX carry it; optionally add TTS/SFX from an audio provider |
| Video: 720p+ | 1080p/4K showcase renders | Upscale only the final picks |
| Moderation behaviour | Heist/combat themes can trip filters | Soften wording ("playful sneaky raccoon" not "burglar"), switch model, keep it family-friendly |

### Loop fallbacks (no last-frame input)
1. **Return-to-pose prompting**: "…and returns exactly to the starting pose". Then check with `analyze.mjs seam`.
2. **Crossfade loop**: blend the last ~0.4 s into the first frames with ffmpeg `xfade`. Hides small seams.
3. **Ping-pong**: play forward then reversed (`reverse` + `concat`). Only for motion that reads both ways (breathing, swaying, blinking lights).
4. **Short hold**: if all else fails, freeze the last frame and let the engine's hotspots or timers carry the state.

## 3. The adapter contract
Whatever the provider, every generation is one of these calls. Wrap them mentally (MCP) or in a tiny script (API):

```
image(prompt, refs[] = [], aspect = "16:9", size = "2K")  -> file in assets/source/, url
video(first_frame, last_frame? , prompt, seconds, aspect = "16:9", resolution = "720p", audio = bool) -> file, url
upscale(video, factor)            (optional)
```

Rules for every call:
- **Quote before spending** if the provider can (some MCPs require a quote id). Otherwise compute from the price list and tell the user.
- **Batch independent jobs** (all keyframes, then all clips) and poll; show progress cards if the MCP offers them.
- **Save the original file** to `assets/source/<id>.png|mp4` and append to `assets/manifest.json`:
  `{ id, kind, provider, model, prompt, refs, first, last, seconds, url, cost, created }`.
- Never print API keys; read them from the environment inside scripts.
- On failure (moderation, timeout), retry once with adjusted wording or another model. Report what failed and what it cost (usually nothing).

### API-script pattern (when there is no MCP)
Write a small Node script per provider in the game folder (`tools/gen.mjs`) that:
1. reads the key from the environment,
2. uploads reference images if the API needs URLs,
3. submits the job and polls until it finishes, with a timeout,
4. downloads the result into `assets/source/`,
5. updates the manifest.

Read the provider's current API docs for exact endpoints and field names (e.g. `image_url` / `first_frame_image` / `end_image` / `last_frame`) rather than guessing.

## 4. Known providers (examples, not defaults; verify current docs and prices)
| Type | Examples | Notes seen in practice |
|---|---|---|
| Aggregator MCP / API | Frameo, fal, Replicate, WaveSpeed | One key, many models; usually quote or per-second pricing; image refs and first/last frame depend on the model |
| Video models | Wan, Seedance, Kling, Veo, Runway, Luma Ray, MiniMax/Hailuo, Sora | Check first/last frame, max seconds, audio, aspect options per model |
| Image models | Nano Banana, GPT Image, Seedream, Flux, Imagen | Check how many reference images; character sheets work best on models strong at identity |

**Tested combination** (both example games):
- **Images:** a reference-capable image model for sheets and keyframes.
- **Video:** an image-to-video model with first+last frame and generated audio at 720p.
- **Cost:** about 1,300–1,400 credits per 16–17-clip game on the provider used.
