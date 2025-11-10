import * as THREE from 'three'

export interface VRCard {
  id: string
  title: string
  content: any
  position: THREE.Vector3
  size: { width: number; height: number }
  type: string
  mesh?: THREE.Group
}

export class VRSceneManager {
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private xrSession: XRSession | null = null
  private cards: Map<string, VRCard> = new Map()
  private controllers: THREE.Group[] = []
  private raycaster = new THREE.Raycaster()
  private selectedObject: THREE.Object3D | null = null
  private grabOffset = new THREE.Vector3()
  private clock = new THREE.Clock()
  
  // Environment settings
  private readonly ROOM_SIZE = 10
  private readonly CARD_DEPTH = 0.02
  private readonly CARD_PADDING = 0.1
  
  constructor(canvas: HTMLCanvasElement) {
    // Initialize scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000033)
    this.scene.fog = new THREE.Fog(0x000033, 5, 50)
    
    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.position.set(0, 1.6, 3)
    
    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.xr.enabled = true
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    
    this.setupEnvironment()
    this.setupLighting()
    this.setupControllers()
  }
  
  private setupEnvironment() {
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(this.ROOM_SIZE, this.ROOM_SIZE)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.8,
      metalness: 0.2
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    
    // Add grid for spatial reference
    const gridHelper = new THREE.GridHelper(this.ROOM_SIZE, 20, 0x3b82f6, 0x1e40af)
    gridHelper.position.y = 0.01
    this.scene.add(gridHelper)
    
    // Create walls with glass effect
    const wallMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.1,
      roughness: 0.1,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0
    })
    
    // Back wall
    const wallGeometry = new THREE.PlaneGeometry(this.ROOM_SIZE, 4)
    const backWall = new THREE.Mesh(wallGeometry, wallMaterial)
    backWall.position.z = -this.ROOM_SIZE / 2
    backWall.position.y = 2
    this.scene.add(backWall)
    
    // Add particle system for atmosphere
    const particlesGeometry = new THREE.BufferGeometry()
    const particlesCount = 1000
    const posArray = new Float32Array(particlesCount * 3)
    
    for (let i = 0; i < particlesCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * this.ROOM_SIZE
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.02,
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    })
    
    const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial)
    this.scene.add(particlesMesh)
  }
  
  private setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambientLight)
    
    // Main directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.camera.near = 0.1
    directionalLight.shadow.camera.far = 50
    directionalLight.shadow.camera.left = -10
    directionalLight.shadow.camera.right = 10
    directionalLight.shadow.camera.top = 10
    directionalLight.shadow.camera.bottom = -10
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    this.scene.add(directionalLight)
    
    // Add point lights for card highlighting
    const colors = [0x3b82f6, 0x8b5cf6, 0x10b981]
    colors.forEach((color, i) => {
      const pointLight = new THREE.PointLight(color, 0.5, 5)
      pointLight.position.set(
        Math.cos((i / colors.length) * Math.PI * 2) * 3,
        2,
        Math.sin((i / colors.length) * Math.PI * 2) * 3
      )
      this.scene.add(pointLight)
    })
  }
  
  private setupControllers() {
    // Controller 1
    const controller1 = this.renderer.xr.getController(0)
    controller1.addEventListener('selectstart', this.onSelectStart.bind(this))
    controller1.addEventListener('selectend', this.onSelectEnd.bind(this))
    controller1.addEventListener('squeeze', this.onSqueeze.bind(this))
    this.scene.add(controller1)
    this.controllers.push(controller1)
    
    // Controller 2
    const controller2 = this.renderer.xr.getController(1)
    controller2.addEventListener('selectstart', this.onSelectStart.bind(this))
    controller2.addEventListener('selectend', this.onSelectEnd.bind(this))
    controller2.addEventListener('squeeze', this.onSqueeze.bind(this))
    this.scene.add(controller2)
    this.controllers.push(controller2)
    
    // Add visual indicators for controllers
    const controllerModelFactory = new THREE.BoxGeometry(0.05, 0.05, 0.2)
    const controllerMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.2
    })
    
    this.controllers.forEach(controller => {
      const controllerMesh = new THREE.Mesh(controllerModelFactory, controllerMaterial)
      controller.add(controllerMesh)
      
      // Add ray for pointing
      const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -10)
      ])
      const rayMaterial = new THREE.LineBasicMaterial({
        color: 0x3b82f6,
        linewidth: 2,
        transparent: true,
        opacity: 0.5
      })
      const ray = new THREE.Line(rayGeometry, rayMaterial)
      controller.add(ray)
    })
  }
  
  createCard(cardData: Partial<VRCard>): VRCard {
    const card: VRCard = {
      id: cardData.id || Date.now().toString(),
      title: cardData.title || 'Untitled',
      content: cardData.content || {},
      position: cardData.position || new THREE.Vector3(0, 1.5, -2),
      size: cardData.size || { width: 1, height: 0.8 },
      type: cardData.type || 'default'
    }
    
    // Create card group
    const cardGroup = new THREE.Group()
    
    // Create main panel
    const panelGeometry = new THREE.PlaneGeometry(card.size.width, card.size.height)
    const panelMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.15,
      roughness: 0.1,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0,
      side: THREE.DoubleSide
    })
    const panel = new THREE.Mesh(panelGeometry, panelMaterial)
    panel.castShadow = true
    panel.receiveShadow = true
    cardGroup.add(panel)
    
    // Add glass border
    const borderGeometry = new THREE.EdgesGeometry(panelGeometry)
    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0x93c5fd,
      linewidth: 2
    })
    const border = new THREE.LineSegments(borderGeometry, borderMaterial)
    cardGroup.add(border)
    
    // Add title text
    const titleCanvas = this.createTextCanvas(card.title, {
      fontSize: 48,
      fontWeight: 'bold',
      color: 'white',
      width: 512,
      height: 128
    })
    const titleTexture = new THREE.CanvasTexture(titleCanvas)
    const titleMaterial = new THREE.MeshBasicMaterial({
      map: titleTexture,
      transparent: true,
      side: THREE.DoubleSide
    })
    const titleMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(card.size.width * 0.9, card.size.height * 0.2),
      titleMaterial
    )
    titleMesh.position.y = card.size.height * 0.35
    titleMesh.position.z = 0.01
    cardGroup.add(titleMesh)
    
    // Add content based on type
    this.addCardContent(cardGroup, card)
    
    // Set position
    cardGroup.position.copy(card.position)
    
    // Add to scene
    card.mesh = cardGroup
    this.scene.add(cardGroup)
    this.cards.set(card.id, card)
    
    // Add hover animation
    this.animateCardEntry(cardGroup)
    
    return card
  }
  
  private createTextCanvas(
    text: string,
    options: {
      fontSize?: number
      fontWeight?: string
      color?: string
      width?: number
      height?: number
    } = {}
  ): HTMLCanvasElement {
    const {
      fontSize = 32,
      fontWeight = 'normal',
      color = 'white',
      width = 512,
      height = 128
    } = options
    
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0)'
    ctx.fillRect(0, 0, width, height)
    
    ctx.fillStyle = color
    ctx.font = `${fontWeight} ${fontSize}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2)
    
    return canvas
  }
  
  private addCardContent(cardGroup: THREE.Group, card: VRCard) {
    // Different content types
    switch (card.type) {
      case 'task':
        this.addTaskContent(cardGroup, card)
        break
      case 'stats':
        this.addStatsContent(cardGroup, card)
        break
      case 'communication':
        this.addCommunicationContent(cardGroup, card)
        break
      default:
        this.addDefaultContent(cardGroup, card)
    }
  }
  
  private addTaskContent(cardGroup: THREE.Group, card: VRCard) {
    // Add task list items
    const tasks = card.content.tasks || []
    tasks.slice(0, 4).forEach((task: any, index: number) => {
      const taskCanvas = this.createTextCanvas(task.title, {
        fontSize: 24,
        color: task.completed ? '#9ca3af' : '#ffffff',
        width: 512,
        height: 64
      })
      
      const taskTexture = new THREE.CanvasTexture(taskCanvas)
      const taskMaterial = new THREE.MeshBasicMaterial({
        map: taskTexture,
        transparent: true
      })
      
      const taskMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(card.size.width * 0.9, 0.1),
        taskMaterial
      )
      taskMesh.position.y = 0.1 - index * 0.15
      taskMesh.position.z = 0.01
      cardGroup.add(taskMesh)
    })
  }
  
  private addStatsContent(cardGroup: THREE.Group, card: VRCard) {
    // Add visual stats representation
    const value = card.content.value || 0
    const max = card.content.max || 100
    const percentage = value / max
    
    // Progress bar
    const barWidth = card.size.width * 0.8
    const barHeight = 0.1
    
    // Background
    const bgGeometry = new THREE.PlaneGeometry(barWidth, barHeight)
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.5
    })
    const bgBar = new THREE.Mesh(bgGeometry, bgMaterial)
    bgBar.position.y = -0.1
    bgBar.position.z = 0.01
    cardGroup.add(bgBar)
    
    // Progress
    const progressGeometry = new THREE.PlaneGeometry(barWidth * percentage, barHeight)
    const progressMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.3
    })
    const progressBar = new THREE.Mesh(progressGeometry, progressMaterial)
    progressBar.position.x = -barWidth * (1 - percentage) / 2
    progressBar.position.y = -0.1
    progressBar.position.z = 0.02
    cardGroup.add(progressBar)
  }
  
  private addCommunicationContent(cardGroup: THREE.Group, card: VRCard) {
    // Add communication interface elements
    const buttonWidth = card.size.width * 0.4
    const buttonHeight = 0.15
    
    // Call button
    const callButton = this.createButton('Call', buttonWidth, buttonHeight, 0x10b981)
    callButton.position.set(-buttonWidth / 2 - 0.05, -0.2, 0.02)
    cardGroup.add(callButton)
    
    // SMS button
    const smsButton = this.createButton('SMS', buttonWidth, buttonHeight, 0x3b82f6)
    smsButton.position.set(buttonWidth / 2 + 0.05, -0.2, 0.02)
    cardGroup.add(smsButton)
  }
  
  private addDefaultContent(cardGroup: THREE.Group, card: VRCard) {
    // Generic content
    const contentCanvas = this.createTextCanvas(
      JSON.stringify(card.content).substring(0, 50) + '...',
      {
        fontSize: 20,
        color: '#9ca3af',
        width: 512,
        height: 256
      }
    )
    
    const contentTexture = new THREE.CanvasTexture(contentCanvas)
    const contentMaterial = new THREE.MeshBasicMaterial({
      map: contentTexture,
      transparent: true
    })
    
    const contentMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(card.size.width * 0.9, card.size.height * 0.5),
      contentMaterial
    )
    contentMesh.position.y = -0.1
    contentMesh.position.z = 0.01
    cardGroup.add(contentMesh)
  }
  
  private createButton(
    text: string,
    width: number,
    height: number,
    color: number
  ): THREE.Group {
    const buttonGroup = new THREE.Group()
    
    // Button background
    const buttonGeometry = new THREE.PlaneGeometry(width, height)
    const buttonMaterial = new THREE.MeshPhysicalMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.8,
      roughness: 0.1,
      metalness: 0.5
    })
    const buttonMesh = new THREE.Mesh(buttonGeometry, buttonMaterial)
    buttonGroup.add(buttonMesh)
    
    // Button text
    const textCanvas = this.createTextCanvas(text, {
      fontSize: 32,
      fontWeight: 'bold',
      width: 256,
      height: 64
    })
    const textTexture = new THREE.CanvasTexture(textCanvas)
    const textMaterial = new THREE.MeshBasicMaterial({
      map: textTexture,
      transparent: true
    })
    const textMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.9, height * 0.8),
      textMaterial
    )
    textMesh.position.z = 0.001
    buttonGroup.add(textMesh)
    
    return buttonGroup
  }
  
  private animateCardEntry(cardGroup: THREE.Group) {
    // Scale animation
    cardGroup.scale.set(0, 0, 0)
    const targetScale = 1
    
    const animate = () => {
      if (cardGroup.scale.x < targetScale) {
        cardGroup.scale.x += 0.05
        cardGroup.scale.y += 0.05
        cardGroup.scale.z += 0.05
        
        if (cardGroup.scale.x > targetScale) {
          cardGroup.scale.set(targetScale, targetScale, targetScale)
        } else {
          requestAnimationFrame(animate)
        }
      }
    }
    
    animate()
  }
  
  private onSelectStart(event: any) {
    const controller = event.target
    const intersections = this.getIntersections(controller)
    
    if (intersections.length > 0) {
      const intersection = intersections[0]
      const object = intersection.object.parent
      
      // Store the selected object and calculate grab offset
      this.selectedObject = object
      controller.attach(object)
      
      // Visual feedback
      this.highlightObject(object, true)
    }
  }
  
  private onSelectEnd(event: any) {
    const controller = event.target
    
    if (this.selectedObject) {
      // Return object to scene
      this.scene.attach(this.selectedObject)
      this.highlightObject(this.selectedObject, false)
      this.selectedObject = null
    }
  }
  
  private onSqueeze(event: any) {
    // Handle squeeze action (secondary button)
    // Could be used for deleting cards or other actions
  }
  
  private getIntersections(controller: THREE.Group): THREE.Intersection[] {
    const tempMatrix = new THREE.Matrix4()
    tempMatrix.identity().extractRotation(controller.matrixWorld)
    
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld)
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix)
    
    const intersects: THREE.Intersection[] = []
    
    // Check all card meshes
    this.cards.forEach(card => {
      if (card.mesh) {
        const cardIntersects = this.raycaster.intersectObject(card.mesh, true)
        intersects.push(...cardIntersects)
      }
    })
    
    return intersects.sort((a, b) => a.distance - b.distance)
  }
  
  private highlightObject(object: THREE.Object3D, highlight: boolean) {
    object.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (highlight) {
          // Store original material
          (mesh as any).originalMaterial = mesh.material
          // Create highlighted material
          mesh.material = new THREE.MeshPhysicalMaterial({
            color: 0x3b82f6,
            emissive: 0x3b82f6,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.3
          })
        } else {
          // Restore original material
          if ((mesh as any).originalMaterial) {
            mesh.material = (mesh as any).originalMaterial
            delete (mesh as any).originalMaterial
          }
        }
      }
    })
  }
  
  arrangeCards(layout: 'grid' | 'circle' | 'wall' = 'grid') {
    const cards = Array.from(this.cards.values())
    
    switch (layout) {
      case 'grid':
        this.arrangeGrid(cards)
        break
      case 'circle':
        this.arrangeCircle(cards)
        break
      case 'wall':
        this.arrangeWall(cards)
        break
    }
  }
  
  private arrangeGrid(cards: VRCard[]) {
    const cols = Math.ceil(Math.sqrt(cards.length))
    const spacing = 1.5
    const startX = -(cols - 1) * spacing / 2
    const startZ = -2
    
    cards.forEach((card, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      
      const targetPos = new THREE.Vector3(
        startX + col * spacing,
        1.5,
        startZ - row * spacing
      )
      
      this.animateCardTo(card, targetPos)
    })
  }
  
  private arrangeCircle(cards: VRCard[]) {
    const radius = 3
    const centerY = 1.5
    
    cards.forEach((card, index) => {
      const angle = (index / cards.length) * Math.PI * 2
      const targetPos = new THREE.Vector3(
        Math.cos(angle) * radius,
        centerY,
        Math.sin(angle) * radius
      )
      
      this.animateCardTo(card, targetPos)
      
      // Make cards face the center
      if (card.mesh) {
        card.mesh.lookAt(0, centerY, 0)
      }
    })
  }
  
  private arrangeWall(cards: VRCard[]) {
    const cols = Math.ceil(Math.sqrt(cards.length))
    const rows = Math.ceil(cards.length / cols)
    const spacing = 1.5
    const startX = -(cols - 1) * spacing / 2
    const startY = rows * spacing / 2
    
    cards.forEach((card, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      
      const targetPos = new THREE.Vector3(
        startX + col * spacing,
        startY - row * spacing,
        -4
      )
      
      this.animateCardTo(card, targetPos)
    })
  }
  
  private animateCardTo(card: VRCard, targetPosition: THREE.Vector3) {
    if (!card.mesh) return
    
    const startPos = card.mesh.position.clone()
    const duration = 1000 // 1 second
    const startTime = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing function
      const eased = 1 - Math.pow(1 - progress, 3)
      
      card.mesh!.position.lerpVectors(startPos, targetPosition, eased)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        card.position = targetPosition.clone()
      }
    }
    
    animate()
  }
  
  async startXR() {
    if (!navigator.xr) {
      throw new Error('WebXR not supported')
    }
    
    try {
      this.xrSession = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      })
      
      await this.renderer.xr.setSession(this.xrSession)
      
      // Start render loop
      this.renderer.setAnimationLoop(this.render.bind(this))
      
      return this.xrSession
    } catch (error) {
      console.error('Failed to start XR session:', error)
      throw error
    }
  }
  
  private render() {
    const delta = this.clock.getDelta()
    
    // Update animations
    this.updateAnimations(delta)
    
    // Update particle system
    const particles = this.scene.getObjectByProperty('type', 'Points') as THREE.Points
    if (particles) {
      particles.rotation.y += delta * 0.1
    }
    
    // Render scene
    this.renderer.render(this.scene, this.camera)
  }
  
  private updateAnimations(delta: number) {
    // Floating animation for cards
    this.cards.forEach(card => {
      if (card.mesh && !this.selectedObject) {
        card.mesh.position.y += Math.sin(Date.now() * 0.001 + card.mesh.position.x) * 0.001
      }
    })
  }
  
  dispose() {
    if (this.xrSession) {
      this.xrSession.end()
    }
    
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    this.scene.clear()
    this.cards.clear()
  }
}