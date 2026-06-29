package pl.ku1son.quizservice.service;

import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Iterator;

@Component
public class ImageCompressor {
    public static final int MAX_SOURCE_WIDTH = 3840;
    public static final int MAX_SOURCE_HEIGHT = 2160;
    public static final int STORED_MAX_WIDTH = 800;
    public static final int STORED_MAX_HEIGHT = 600;
    private static final float JPEG_QUALITY = 0.75f;

    public byte[] compressFromBase64(String base64) {
        if (base64 == null || base64.isBlank()) {
            return null;
        }

        String payload = base64.contains(",") ? base64.substring(base64.indexOf(',') + 1) : base64;

        try {
            return compress(Base64.getDecoder().decode(payload));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Invalid image data", exception);
        }
    }

    public byte[] compress(byte[] rawImage) {
        if (rawImage == null || rawImage.length == 0) {
            return null;
        }

        try {
            BufferedImage source = ImageIO.read(new ByteArrayInputStream(rawImage));

            if (source == null) {
                throw new IllegalArgumentException("Unsupported image format");
            }

            if (source.getWidth() > MAX_SOURCE_WIDTH || source.getHeight() > MAX_SOURCE_HEIGHT) {
                throw new IllegalArgumentException(
                        "Image exceeds 4K limit (" + MAX_SOURCE_WIDTH + "x" + MAX_SOURCE_HEIGHT + ")"
                );
            }

            BufferedImage resized = resize(source, STORED_MAX_WIDTH, STORED_MAX_HEIGHT);
            return encodeJpeg(resized);
        } catch (IOException exception) {
            throw new IllegalArgumentException("Could not process image", exception);
        }
    }

    public String toBase64(byte[] imageData) {
        if (imageData == null || imageData.length == 0) {
            return null;
        }

        return Base64.getEncoder().encodeToString(imageData);
    }

    private BufferedImage resize(BufferedImage source, int maxWidth, int maxHeight) {
        int width = source.getWidth();
        int height = source.getHeight();
        double scale = Math.min(1.0, Math.min((double) maxWidth / width, (double) maxHeight / height));

        if (scale >= 1.0) {
            return toRgb(source);
        }

        int targetWidth = Math.max(1, (int) Math.round(width * scale));
        int targetHeight = Math.max(1, (int) Math.round(height * scale));
        BufferedImage resized = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = resized.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.drawImage(source, 0, 0, targetWidth, targetHeight, null);
        graphics.dispose();
        return resized;
    }

    private BufferedImage toRgb(BufferedImage source) {
        if (source.getType() == BufferedImage.TYPE_INT_RGB) {
            return source;
        }

        BufferedImage rgb = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = rgb.createGraphics();
        graphics.drawImage(source, 0, 0, null);
        graphics.dispose();
        return rgb;
    }

    private byte[] encodeJpeg(BufferedImage image) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");

        if (!writers.hasNext()) {
            throw new IllegalStateException("JPEG writer not available");
        }

        ImageWriter writer = writers.next();
        ImageWriteParam params = writer.getDefaultWriteParam();
        params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        params.setCompressionQuality(JPEG_QUALITY);

        ByteArrayOutputStream output = new ByteArrayOutputStream();

        try (MemoryCacheImageOutputStream imageOutput = new MemoryCacheImageOutputStream(output)) {
            writer.setOutput(imageOutput);
            writer.write(null, new IIOImage(image, null, null), params);
        } finally {
            writer.dispose();
        }

        return output.toByteArray();
    }
}
