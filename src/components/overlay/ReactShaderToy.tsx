import { useEffect, useRef, useCallback } from 'react'

interface Uniform {
  value: number | number[]
  type?: 'float' | 'vec2' | 'vec3' | 'vec4'
}

interface ReactShaderToyProps {
  fs: string
  uniforms?: Record<string, Uniform>
  className?: string
  devicePixelRatio?: number
}

const DEFAULT_VS = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

export function ReactShaderToy({
  fs,
  uniforms = {},
  className,
  devicePixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1,
}: ReactShaderToyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const animFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(Date.now())
  const uniformsRef = useRef(uniforms)
  uniformsRef.current = uniforms

  const initGL = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    })
    if (!gl) return

    glRef.current = gl

    // Create shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, DEFAULT_VS)
    gl.compileShader(vs)

    const fragSource = `
      precision highp float;
      uniform vec2 iResolution;
      uniform float iTime;
      ${Object.entries(uniforms)
        .map(([name, u]) => {
          const type = u.type || (typeof u.value === 'number' ? 'float' : `vec${(u.value as number[]).length}`)
          return `uniform ${type} ${name};`
        })
        .join('\n')}

      ${fs}

      void main() {
        vec4 color = vec4(0.0);
        mainImage(color, gl_FragCoord.xy);
        gl_FragColor = color;
      }
    `

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(frag, fragSource)
    gl.compileShader(frag)

    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(frag))
      return
    }

    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, frag)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return
    }

    programRef.current = program

    // Full-screen quad
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    )

    const posAttr = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(posAttr)
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0)

    gl.useProgram(program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    startTimeRef.current = Date.now()
  }, [fs])

  const render = useCallback(() => {
    const gl = glRef.current
    const program = programRef.current
    const canvas = canvasRef.current
    if (!gl || !program || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const w = rect.width * devicePixelRatio
    const h = rect.height * devicePixelRatio

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const time = (Date.now() - startTimeRef.current) / 1000
    const resLoc = gl.getUniformLocation(program, 'iResolution')
    const timeLoc = gl.getUniformLocation(program, 'iTime')
    gl.uniform2f(resLoc, w, h)
    gl.uniform1f(timeLoc, time)

    // Set custom uniforms
    const currentUniforms = uniformsRef.current
    for (const [name, u] of Object.entries(currentUniforms)) {
      const loc = gl.getUniformLocation(program, name)
      if (!loc) continue
      if (typeof u.value === 'number') {
        gl.uniform1f(loc, u.value)
      } else if (Array.isArray(u.value)) {
        switch (u.value.length) {
          case 2: gl.uniform2f(loc, u.value[0], u.value[1]); break
          case 3: gl.uniform3f(loc, u.value[0], u.value[1], u.value[2]); break
          case 4: gl.uniform4f(loc, u.value[0], u.value[1], u.value[2], u.value[3]); break
        }
      }
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    animFrameRef.current = requestAnimationFrame(render)
  }, [devicePixelRatio])

  useEffect(() => {
    initGL()
    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [initGL, render])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
