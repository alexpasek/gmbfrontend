import piexif from "piexifjs";

function toRationalArray(value) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 6000) / 100; // keep two decimals
  return [
    [deg, 1],
    [min, 1],
    [Math.round(sec * 100), 100],
  ];
}

function dataUrlToBlob(dataUrl, filename = "image.jpg") {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1] || "image/jpeg";
  const binary = atob(parts[1]);
  const len = binary.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = binary.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

export async function embedPhotoExif(file, meta = {}) {
  try {
    const ext = (file.name || "").toLowerCase();
    const mime = file.type || "";
    if (!/jpe?g$/.test(ext) && !/jpe?g/.test(mime)) return file;

    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const exif = { "0th": {}, GPS: {}, Exif: {} };

    const lat = parseFloat(meta.lat);
    const lng = parseFloat(meta.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
      exif.GPS[piexif.GPSIFD.GPSLatitude] = toRationalArray(lat);
      exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
      exif.GPS[piexif.GPSIFD.GPSLongitude] = toRationalArray(lng);
    }

    const parts = [
      meta.businessName,
      meta.city,
      meta.neighbourhood,
      meta.serviceKeywords,
      meta.categoryKeywords,
      meta.website,
    ]
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    if (parts.length) {
      const desc = parts.join(" | ");
      exif["0th"][piexif.ImageIFD.ImageDescription] = desc;
      exif.Exif[piexif.ExifIFD.UserComment] = desc;
      exif["0th"][piexif.ImageIFD.Artist] = meta.businessName || "";
    }

    const exifStr = piexif.dump(exif);
    const newDataUrl = piexif.insert(exifStr, dataUrl);
    return dataUrlToBlob(newDataUrl, file.name || "image.jpg");
  } catch (_e) {
    // If anything fails, just return original file to avoid blocking uploads
    return file;
  }
}
