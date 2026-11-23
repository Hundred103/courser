package net.edu.courser.quizservice.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

@Service
public class MediaStorageService {
    public static final long MAX_IMAGE_BYTES = 16L * 1024L * 1024L;

    private static final Map<String, String> EXTENSION_BY_CONTENT_TYPE = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/gif", "gif",
            "image/webp", "webp",
            "image/bmp", "bmp"
    );

    /** Stripe locks so store/touch and age-check/delete for the same key cannot race. */
    private static final int LOCK_STRIPES = 64;
    private final Object[] keyLocks = new Object[LOCK_STRIPES];

    private final Path storageRoot;
    private final String publicBaseUrl;

    public MediaStorageService(
            @Value("${app.media.storage-path:/var/courser-media}") String storagePath,
            @Value("${app.media.public-base-url:/media}") String publicBaseUrl
    ) {
        this.storageRoot = Path.of(storagePath).toAbsolutePath().normalize();
        this.publicBaseUrl = publicBaseUrl.endsWith("/")
                ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1)
                : publicBaseUrl;
        for (int i = 0; i < keyLocks.length; i++) {
            keyLocks[i] = new Object();
        }
        try {
            Files.createDirectories(this.storageRoot);
        } catch (IOException exception) {
            throw new IllegalStateException("Could not create media storage directory", exception);
        }
    }

    /** Store bytes; type from file signature only. */
    public String store(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalArgumentException("Plik obrazu jest pusty.");
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new IllegalArgumentException("Obraz może mieć maksymalnie 16 MB.");
        }

        String contentType = detectContentType(bytes);
        if (contentType == null) {
            throw new IllegalArgumentException("Nieobsługiwany format obrazu. Dozwolone: JPEG, PNG, GIF, WebP, BMP.");
        }
        String extension = EXTENSION_BY_CONTENT_TYPE.get(contentType);
        String hash = sha256(bytes);
        String key = hash + "." + extension;
        Path target = storageRoot.resolve(key).normalize();

        if (!target.startsWith(storageRoot)) {
            throw new IllegalArgumentException("Nieprawidłowa ścieżka mediów.");
        }

        synchronized (lockFor(key)) {
            try {
                if (Files.exists(target)) {
                    markUsed(target);
                } else {
                    Files.write(target, bytes);
                }
            } catch (IOException exception) {
                throw new IllegalStateException("Nie udało się zapisać obrazu.", exception);
            }
        }

        return key;
    }

    public byte[] read(String key) {
        Path path = resolveExisting(key);
        try {
            return Files.readAllBytes(path);
        } catch (IOException exception) {
            throw new IllegalStateException("Nie udało się odczytać obrazu.", exception);
        }
    }

    /**
     * Touch mtime for keys still referenced; delete others unused since {@code unusedBefore}.
     * Age check and delete run under the same per-key lock as {@link #store(byte[])}.
     */
    public int deleteUnused(Set<String> usedKeys, Instant unusedBefore) {
        int deleted = 0;
        try (Stream<Path> files = Files.list(storageRoot)) {
            for (Path file : (Iterable<Path>) files::iterator) {
                String key = file.getFileName().toString();
                if (!Files.isRegularFile(file) || !looksLikeMediaKey(key)) continue;
                if (usedKeys.contains(key)) {
                    synchronized (lockFor(key)) {
                        if (Files.isRegularFile(file)) {
                            markUsed(file);
                        }
                    }
                    continue;
                }
                synchronized (lockFor(key)) {
                    if (!Files.isRegularFile(file)) continue;
                    Instant modified = Files.getLastModifiedTime(file).toInstant();
                    if (modified.isBefore(unusedBefore)) {
                        Files.delete(file);
                        deleted++;
                    }
                }
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Nie udało się usunąć nieużywanych obrazów.", exception);
        }
        return deleted;
    }

    private Object lockFor(String key) {
        return keyLocks[(key.hashCode() & 0x7fffffff) % LOCK_STRIPES];
    }

    private void markUsed(Path file) throws IOException {
        Files.setLastModifiedTime(file, FileTime.from(Instant.now()));
    }

    public boolean exists(String key) {
        if (key == null || key.isBlank()) {
            return false;
        }
        try {
            resolveExisting(key);
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    public String publicUrl(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        String normalized = normalizeKey(key);
        return publicBaseUrl + "/" + normalized;
    }

    public String extractKey(String imageReference) {
        if (imageReference == null || imageReference.isBlank()) {
            return null;
        }

        String value = imageReference.trim();
        if (value.startsWith("data:")) {
            return null;
        }

        String candidate;
        String marker = publicBaseUrl + "/";
        if (value.startsWith(marker)) {
            candidate = value.substring(marker.length());
        } else if (value.startsWith("/media/")) {
            candidate = value.substring("/media/".length());
        } else if (value.contains("/")) {
            candidate = value.substring(value.lastIndexOf('/') + 1);
        } else if (looksLikeMediaKey(value)) {
            candidate = value;
        } else {
            return null;
        }

        return normalizeKey(candidate);
    }

    public boolean isMediaReference(String imageReference) {
        if (imageReference == null || imageReference.isBlank() || imageReference.startsWith("data:")) {
            return false;
        }
        try {
            String key = extractKey(imageReference);
            return key != null && exists(key);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean looksLikeMediaKey(String value) {
        String lower = value.toLowerCase(Locale.ROOT).replace(".jpeg", ".jpg");
        return lower.matches("^[a-f0-9]{64}\\.(jpg|png|gif|webp|bmp)$");
    }

    private Path resolveExisting(String key) {
        String normalized = normalizeKey(key);
        Path path = storageRoot.resolve(normalized).normalize();
        if (!path.startsWith(storageRoot) || !Files.isRegularFile(path)) {
            throw new IllegalArgumentException("Nie znaleziono pliku multimediów.");
        }
        return path;
    }

    private String normalizeKey(String key) {
        String normalized = key.trim().replace('\\', '/');
        if (normalized.contains("/") || normalized.contains("..")) {
            throw new IllegalArgumentException("Nieprawidłowy klucz multimediów.");
        }
        String lower = normalized.toLowerCase(Locale.ROOT).replace(".jpeg", ".jpg");
        if (!lower.matches("^[a-f0-9]{64}\\.(jpg|png|gif|webp|bmp)$")) {
            throw new IllegalArgumentException("Nieprawidłowy klucz multimediów.");
        }
        return lower;
    }

    private String detectContentType(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (bytes.length >= 8
                && bytes[0] == (byte) 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47
                && bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A) {
            return "image/png";
        }
        if (bytes.length >= 6
                && bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F'
                && bytes[3] == '8' && (bytes[4] == '7' || bytes[4] == '9') && bytes[5] == 'a') {
            return "image/gif";
        }
        if (bytes.length >= 12
                && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "image/webp";
        }
        if (bytes.length >= 2 && bytes[0] == 'B' && bytes[1] == 'M') {
            return "image/bmp";
        }
        return null;
    }

    private String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
