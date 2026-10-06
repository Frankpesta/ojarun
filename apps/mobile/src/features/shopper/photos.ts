import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const LONG_EDGE = 1280;

/** Photos waiting to upload live here, not in the cache, which Android may clear (05 §8). */
function queueDir(): Directory {
  const dir = new Directory(Paths.document, "upload-queue");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Shrinks a camera photo to a 1280 px long edge at JPEG quality 0.6 (about 150–250 KB) and moves
 * it into the queue folder. Returns the file's URI for the upload job.
 */
export async function prepareItemPhoto(cameraUri: string, jobId: string): Promise<string> {
  const probe = await ImageManipulator.manipulate(cameraUri).renderAsync();
  const landscape = probe.width >= probe.height;
  const needsResize = Math.max(probe.width, probe.height) > LONG_EDGE;
  const context = ImageManipulator.manipulate(cameraUri);
  if (needsResize) context.resize(landscape ? { width: LONG_EDGE } : { height: LONG_EDGE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG });

  const target = new File(queueDir(), `${jobId}.jpg`);
  if (target.exists) target.delete();
  await new File(saved.uri).move(target);
  return target.uri;
}

/** Removes a queued photo once the server has it. Missing files are fine. */
export function deleteQueuedPhoto(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}
