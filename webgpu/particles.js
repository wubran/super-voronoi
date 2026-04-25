class Site3D {
    // constructor(pos=new Vec3(), vel=new Vec3(), acc=new Vec3()) {
    //     this.pos = pos
    //     this.vel = vel
    //     this.acc = acc
    // }
    constructor(pos=[0,0,0], vel=[0,0,0], acc=[0,0,0], mass=1.0) {
        this.pos = new Vec3(pos)
        this.vel = new Vec3(vel)
        this.acc = new Vec3(acc)
        this.mass = mass;
    }
    calc() {
        // initially nothing.
        this.acc.x += (Math.random()-0.5) * 0.005;
        this.acc.y += (Math.random()-0.5) * 0.005;
        this.acc.z += 0;
    }
    update() {
        // console.log(this.pos, this.vel, this.acc)
        this.pos = this.pos.add(this.vel);
        this.vel = this.vel.add(this.acc);
        this.acc.zero();
    }
}