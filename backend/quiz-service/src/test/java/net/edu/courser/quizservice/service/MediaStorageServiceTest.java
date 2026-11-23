package net.edu.courser.quizservice.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class MediaStorageServiceTest {
    private static final Duration RETENTION = Duration.ofDays(30);

    @TempDir
    Path storage;

    @Test
    void deletesOnlyImagesUnusedForLongerThanRetention() throws Exception {
        MediaStorageService media = new MediaStorageService(storage.toString(), "/media");
        String oldUnused = storeAgedImage(media, 1, 40);
        String oldUsed = storeAgedImage(media, 2, 40);
        String recentUnused = storeAgedImage(media, 3, 5);

        int deleted = media.deleteUnused(Set.of(oldUsed), Instant.now().minus(RETENTION));

        assertThat(deleted).isEqualTo(1);
        assertThat(media.exists(oldUnused)).isFalse();
        assertThat(media.exists(oldUsed)).isTrue();
        assertThat(media.exists(recentUnused)).isTrue();
        assertThat(lastModified(oldUsed)).isAfter(Instant.now().minus(Duration.ofMinutes(1)));
    }

    @Test
    void uploadingAnExistingImageAgainRestartsItsRetention() throws Exception {
        MediaStorageService media = new MediaStorageService(storage.toString(), "/media");
        String key = storeAgedImage(media, 1, 40);

        media.store(png(1));

        assertThat(media.deleteUnused(Set.of(), Instant.now().minus(RETENTION))).isZero();
        assertThat(media.exists(key)).isTrue();
    }

    @Test
    void storeTouchWinsOverConcurrentCleanupOfSameKey() throws Exception {
        MediaStorageService media = new MediaStorageService(storage.toString(), "/media");
        byte[] sameBytes = png(1);
        String key = null;

        // Stress the store/cleanup lock: a late delete after touch must not remove the key.
        for (int i = 0; i < 100; i++) {
            key = storeAgedImage(media, 1, 40);
            Instant cutoff = Instant.now().minus(RETENTION);
            Thread cleanup = new Thread(() -> media.deleteUnused(Set.of(), cutoff));
            Thread upload = new Thread(() -> media.store(sameBytes));
            cleanup.start();
            upload.start();
            cleanup.join();
            upload.join();
            assertThat(media.exists(key)).isTrue();
        }

        assertThat(lastModified(key)).isAfter(Instant.now().minus(Duration.ofMinutes(1)));
    }

    static byte[] png(int variant) {
        return new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, (byte) variant};
    }

    private String storeAgedImage(MediaStorageService media, int variant, int ageDays) throws Exception {
        String key = media.store(png(variant));
        Files.setLastModifiedTime(storage.resolve(key), FileTime.from(Instant.now().minus(Duration.ofDays(ageDays))));
        return key;
    }

    private Instant lastModified(String key) throws Exception {
        return Files.getLastModifiedTime(storage.resolve(key)).toInstant();
    }
}
