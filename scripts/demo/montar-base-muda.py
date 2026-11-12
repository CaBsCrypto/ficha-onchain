from argparse import ArgumentParser
from pathlib import Path
from shutil import which
from subprocess import PIPE, run
from tempfile import TemporaryDirectory


BASE_OUTPUT = 'TrustLeaf-SOW2-Semana3-Base-Muda-EN.mp4'
FINAL_OUTPUT = 'TrustLeaf-SOW2-Semana3-Completa-Muda-EN.mp4'
FPS = 30

# Titles are embedded as chapters. Times are source seconds at original speed.
SHOTS = (
    ('01-Ficha-vacia', 'Open the patient record', '1.25', '6.00'),
    ('02-Ficha-confirmada', 'Record confirmed on Stellar Testnet', '1.00', '6.50'),
    ('03-Permisos-Digital-Cabs', 'Grant read and add permissions', None, None),
    ('04-Primera-nota-Cabs', 'Add the first clinical note', None, None),
    ('05-PDF-clinico-Cabs-Digital', 'Upload and download the clinical PDF', None, None),
)
FINAL_SHOTS = (
    ('06-Receta', 'Book the consultation and issue the prescription', None, None),
    ('07-Correccion-Nota', 'Correct the note and review both versions', None, None),
    ('08-Retiro-Acceso-Denegado', 'Withdraw permissions and confirm access is denied', None, None),
)


def ffmpeg(executable, *args, read_progress=False):
    return run([str(executable), '-hide_banner', '-loglevel', 'error', '-nostdin', '-n', *map(str, args)],
               check=True, text=True, stdout=PIPE if read_progress else None).stdout


def shot_files(directory, stem, *, allow_fragments):
    name = f'TrustLeaf-{stem}-EN-limpia'
    whole = directory / f'{name}.mp4'
    fragments = sorted(directory.glob(f'{name}-[0-9][0-9].mp4')) if allow_fragments else []
    if whole.is_file():
        if fragments:
            raise ValueError(f'Keep only the full take or numbered fragments for {name}')
        return [whole]
    if not fragments:
        raise FileNotFoundError(whole)
    for index, fragment in enumerate(fragments, 1):
        if fragment.name != f'{name}-{index:02}.mp4' or not fragment.is_file():
            raise ValueError(f'Number the fragments of {name} consecutively from 01')
    return fragments


def render(directory, executable, *, cpu, final):
    if not directory.is_dir():
        raise NotADirectoryError(directory)
    output = directory / (FINAL_OUTPUT if final else BASE_OUTPUT)
    if output.exists():
        raise FileExistsError(output)
    shots = SHOTS + (FINAL_SHOTS if final else ())
    sources = [shot_files(directory, stem, allow_fragments=index >= len(SHOTS))
               for index, (stem, _, _, _) in enumerate(shots)]
    encoder = ('libx264', '-preset', 'veryfast', '-crf', '19', '-threads', '2') if cpu else (
        'h264_nvenc', '-preset', 'p2', '-rc', 'constqp', '-qp', '20')
    geometry = ('scale=1440:810:force_original_aspect_ratio=decrease:force_divisible_by=2,'
                'pad=1440:810:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30:start_time=0,format=yuv420p')
    with TemporaryDirectory(prefix='.montaje-', dir=directory) as work:
        work = Path(work)
        files, chapters = ['ffconcat version 1.0'], [';FFMETADATA1', 'title=TrustLeaf - SOW 2 Week 3']
        start = 0
        for index, ((_, title, source_in, duration), fragments) in enumerate(zip(shots, sources), 1):
            seek = ['-ss', source_in] if source_in else []
            length = ['-t', duration] if duration else []
            end = start
            for part, source in enumerate(fragments, 1):
                piece = work / f'{index:02}-{part:02}.mp4'
                progress = ffmpeg(executable, '-threads', '1', *seek, '-i', source, *length,
                                  '-map', '0:v:0', '-an', '-sn', '-dn', '-filter_threads', '1',
                                  '-vf', geometry, '-c:v', *encoder, '-g', '60',
                                  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
                                  '-video_track_timescale', '30000', '-progress', 'pipe:1', '-nostats', piece,
                                  read_progress=True)
                frames = [int(line.split('=', 1)[1]) for line in progress.splitlines() if line.startswith('frame=')]
                if not frames or frames[-1] < 1:
                    raise ValueError(f'No frames encoded for {source.name}')
                end += frames[-1]
                files.append(f"file '{piece.name}'")
            chapters.extend(['[CHAPTER]', f'TIMEBASE=1/{FPS}', f'START={start}', f'END={end}', f'title={title}'])
            print(f'{start/FPS:6.2f} - {end/FPS:6.2f} s   {title}', flush=True)
            start = end
        playlist, markers = work / 'clips.ffconcat', work / 'chapters.ffmetadata'
        playlist.write_text('\n'.join(files) + '\n', encoding='utf-8')
        markers.write_text('\n'.join(chapters) + '\n', encoding='utf-8')
        result = work / output.name
        ffmpeg(executable, '-f', 'concat', '-safe', '1', '-i', playlist, '-f', 'ffmetadata', '-i', markers,
               '-map', '0:v:0', '-map_metadata', '1', '-map_chapters', '1', '-an', '-c:v', 'copy',
               '-movflags', '+faststart', result)
        result.rename(output)
    print(output)


if __name__ == '__main__':
    parser = ArgumentParser(description='Join the English TrustLeaf takes into a silent MP4.')
    parser.add_argument('--artifacts-dir', type=Path, required=True, help='Directory containing the clean takes.')
    parser.add_argument('--ffmpeg-path', type=Path, help='Explicit path to FFmpeg. Defaults to FFmpeg on PATH.')
    parser.add_argument('--final', action='store_true', help='Join all eight takes into the complete video.')
    parser.add_argument('--cpu', action='store_true', help='Encode with two CPU threads instead of NVIDIA NVENC.')
    args = parser.parse_args()
    executable = args.ffmpeg_path.resolve() if args.ffmpeg_path else which('ffmpeg')
    if not executable or not Path(executable).is_file():
        parser.error('Install FFmpeg on PATH or pass --ffmpeg-path.')
    render(args.artifacts_dir.resolve(), executable, cpu=args.cpu, final=args.final)
