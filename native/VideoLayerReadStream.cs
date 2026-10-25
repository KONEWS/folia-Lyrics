// native/VideoLayerReadStream.cs — stream one media byte range without copying a large video into memory.
namespace FoliaLyrics;
internal sealed class VideoLayerReadStream(FileStream file, long start, long count) : Stream
{
    private long position;
    public override bool CanRead => file.CanRead;
    public override bool CanSeek => file.CanSeek;
    public override bool CanWrite => false;
    public override long Length => count;
    public override long Position { get => position; set => Seek(value, SeekOrigin.Begin); }
    public override int Read(byte[] buffer, int offset, int length)
    {
        if (position >= count) return 0;
        file.Position = start + position;
        var read = file.Read(buffer, offset, (int)Math.Min(length, count - position));
        position += read;
        return read;
    }
    public override long Seek(long offset, SeekOrigin origin)
    {
        var next = origin switch { SeekOrigin.Begin => offset, SeekOrigin.Current => position + offset, SeekOrigin.End => count + offset, _ => -1 };
        if (next < 0 || next > count) throw new IOException("Video range seek is out of bounds.");
        position = next; return next;
    }
    public override void Flush() { }
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int length) => throw new NotSupportedException();
    protected override void Dispose(bool disposing) { if (disposing) file.Dispose(); base.Dispose(disposing); }
}
