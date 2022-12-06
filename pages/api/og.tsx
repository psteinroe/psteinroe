import { ImageResponse } from '@vercel/og'
import { NextRequest } from 'next/server'

export const config = {
  runtime: 'experimental-edge',
}

const font = fetch(
  new URL('../../public/fonts/Montserrat-Regular.ttf', import.meta.url)
).then((res) => res.arrayBuffer())

export default async function handler(req: NextRequest) {
  const fontData = await font

  const { searchParams } = req.nextUrl
  const title = searchParams.get('title')

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: '-.02em',
          fontWeight: 700,
          background: 'white',
        }}
      >
        <div
          style={{
            left: 42,
            top: 42,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <img
            alt="psteinroe"
            height={24}
            width={24}
            src="data:image/png;base64,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"
          />
          <span
            style={{
              marginLeft: 8,
              fontSize: 20,
            }}
          >
            philipp.steinroetter.com
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            padding: '20px 50px',
            margin: '0 42px',
            fontSize: 40,
            width: 'auto',
            maxWidth: 550,
            textAlign: 'center',
            backgroundColor: 'black',
            color: 'white',
            lineHeight: 1.4,
          }}
        >
          {title}
        </div>
      </div>
    ),
    {
      width: 800,
      height: 400,
      fonts: [
        {
          name: 'Montserrat',
          data: fontData,
          weight: 400,
          style: 'normal',
        },
      ],
    }
  )
}
