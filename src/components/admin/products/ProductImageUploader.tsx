"use client";

import { useId } from "react";
import Image from "next/image";
import { ImageIcon, UploadCloud, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { HintedLabel } from "@/components/admin/AdminHint";

/** WooCommerce-ish, and as many as a product page can show before it becomes a slideshow. */
export const maxGalleryImages = 10;

/**
 * Push one file into the `product-images` bucket and hand back its public URL.
 *
 * Lifted verbatim out of `ProductUploadWorkspace`, which was about to be
 * deleted with the only working copy of it inside — the edit form in
 * `ProductManagement` had its own near-identical `uploadFile`, and the two had
 * already drifted on the gallery path.
 */
export async function uploadProductImage(file: File, pathPrefix: string): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const filePath = `${pathPrefix}/${fileName}`;
  const { error } = await supabase.storage.from("product-images").upload(filePath, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * A picture that may be a file waiting to upload or a URL already stored.
 *
 * Both cases have to render identically. An edit that only changes the gallery
 * order must not re-upload the eight photos that have not moved, and a create
 * has nothing but files — so the grid speaks one shape.
 */
export type PhotoDraft =
  | { kind: "stored"; url: string }
  | { kind: "file"; file: File; preview: string };

export function photoPreview(photo: PhotoDraft): string {
  return photo.kind === "stored" ? photo.url : photo.preview;
}

/** A data URL for the thumbnail, because the file has no URL until it is uploaded. */
export function readPhotoFile(file: File): Promise<PhotoDraft> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) =>
      resolve({ kind: "file", file, preview: String(event.target?.result || "") });
    reader.readAsDataURL(file);
  });
}

/**
 * Upload whatever is still a file and return the full list of URLs, in order.
 *
 * Order is the point: `product_media.sort_order` is written from the array
 * index, so uploading first and appending afterwards would silently reshuffle
 * a gallery the seller had arranged.
 */
export async function resolvePhotoUrls(
  photos: readonly PhotoDraft[],
  pathPrefix: string,
): Promise<string[]> {
  const uploaded = await Promise.all(
    photos.map((photo) =>
      photo.kind === "stored" ? photo.url : uploadProductImage(photo.file, pathPrefix),
    ),
  );
  return uploaded;
}

function Thumb({ photo, onRemove }: { photo: PhotoDraft; onRemove: () => void }) {
  const source = photoPreview(photo);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--color-brand-tint)]">
      {photo.kind === "stored" ? (
        <Image src={source} alt="" fill sizes="96px" className="object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" className="h-full w-full object-cover" />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove this photo"
        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
      >
        <X size={13} />
      </button>
    </div>
  );
}

/**
 * Step 2 of the wizard: the one photo shoppers see, and the strip beneath it.
 *
 * Both inputs are `sr-only` behind a `<label>` rather than styled file inputs,
 * because a styled `<input type=file>` cannot be made to look like anything on
 * a tablet and the whole drop zone should be the tap target.
 */
export default function ProductImageUploader({
  main,
  gallery,
  error,
  onMainChange,
  onGalleryChange,
}: {
  main: PhotoDraft | null;
  gallery: readonly PhotoDraft[];
  error?: string | null;
  onMainChange: (photo: PhotoDraft | null) => void;
  onGalleryChange: (photos: PhotoDraft[]) => void;
}) {
  const mainInputId = useId();
  const galleryInputId = useId();
  const remaining = maxGalleryImages - gallery.length;

  async function addGallery(files: FileList | null) {
    if (!files) return;
    const accepted = Array.from(files).slice(0, Math.max(0, remaining));
    if (accepted.length === 0) return;
    const drafts = await Promise.all(accepted.map(readPhotoFile));
    onGalleryChange([...gallery, ...drafts]);
  }

  return (
    <div className="space-y-6">
      <div>
        <HintedLabel
          label="Main photo"
          required
          htmlFor={mainInputId}
          hint="The one picture shoppers see on the shop page and in search results. Use a clear photo of the whole product on a plain background."
        />
        <label
          htmlFor={mainInputId}
          className="mt-2 flex min-h-[11rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--color-line)] bg-[var(--color-cream)] p-6 transition hover:bg-[var(--color-brand-tint)]"
        >
          {main ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview(main)} alt="" className="h-40 rounded-xl object-cover" />
          ) : (
            <>
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-surface)]">
                <ImageIcon size={24} style={{ color: "var(--color-brand-deep)" }} />
              </span>
              <span className="text-sm font-semibold">Tap to choose the main photo</span>
            </>
          )}
          <input
            id={mainInputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              onMainChange(file ? await readPhotoFile(file) : null);
            }}
          />
        </label>
        {main && (
          <button
            type="button"
            onClick={() => onMainChange(null)}
            className="admin-button-ghost mt-2 min-h-11 rounded-xl px-3 text-sm font-semibold"
          >
            Choose a different photo
          </button>
        )}
        {error && (
          <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </div>

      <div>
        <HintedLabel
          label="More photos"
          htmlFor={galleryInputId}
          hint={`Extra angles, close-ups of the fabric, or the product being worn. Shoppers swipe through these on the product page. Up to ${maxGalleryImages}.`}
        />
        <label
          htmlFor={galleryInputId}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-line)] bg-[var(--color-cream)] p-5 transition hover:bg-[var(--color-brand-tint)] ${
            remaining <= 0 ? "pointer-events-none opacity-45" : ""
          }`}
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--color-surface)]">
            <UploadCloud size={20} style={{ color: "var(--color-brand-deep)" }} />
          </span>
          <span className="text-sm font-semibold">Tap to add more photos</span>
          <span className="text-xs text-[var(--color-ink-soft)]">
            {remaining > 0 ? `${remaining} more can be added` : "That is the most we can show"}
          </span>
          <input
            id={galleryInputId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => void addGallery(event.target.files)}
          />
        </label>
        {gallery.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {gallery.map((photo, index) => (
              <Thumb
                key={`${photo.kind}-${index}-${photoPreview(photo).slice(-24)}`}
                photo={photo}
                onRemove={() => onGalleryChange(gallery.filter((_, position) => position !== index))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
