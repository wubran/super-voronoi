class Site2D {
    // constructor(pos=new Vec2(), vel=new Vec2(), acc=new Vec2()) {
    //     this.pos = pos
    //     this.vel = vel
    //     this.acc = acc
    // }
    constructor(pos=[0,0], vel=[0,0], acc=[0,0], mass=1.0) {
        this.pos = new Vec2(pos)
        this.vel = new Vec2(vel)
        this.acc = new Vec2(acc)
        this.mass = mass;
    }
    calc() {
        // initially nothing.
        this.acc.x += (Math.random()-0.5) * 0.00001;
        this.acc.y += (Math.random()-0.5) * 0.00001;
    }
    update() {
        // console.log(this.pos, this.vel, this.acc)
        this.pos = this.pos.add(this.vel);
        this.vel = this.vel.add(this.acc);
        this.acc.zero();
    }
}