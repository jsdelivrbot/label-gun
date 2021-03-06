const _ = require('lodash')

class ProbotRequest {
  private robot: any
  private context: any
  private issue: any

  public isCollaborator: boolean
  public isBot: boolean
  public reopen: boolean
  public ignore: boolean

  public state: string
  public labels: Array<string>

  public config: {
    feedback: string
    ignore: Array<string>
    reopen: Array<string>
  }

  constructor(robot: any, context: any) {
    this.robot = robot
    this.context = context
  }

  public async load() {
    // load config
    let config
    try {
      config = await this.context.config('label-gun.yml')
      if (config && config.reopen === '*') config.reopen = ['*']
    } catch (err) {
      this.robot.log(err)
      config = null
    }
    this.config = config || { ignore: [], reopen: [], feedback: '' }
    this.config.feedback = this.config.feedback || 'awaiting-user-feedback'
    this.config.ignore = this.config.ignore || []
    this.config.reopen = this.config.reopen || []

    try {
      this.isCollaborator = await this.context.github.repos.checkCollaborator({...this.context.repo(), username: this.context.payload.sender.login})
    } catch (err) {
      this.robot.log(`${this.context.payload.sender.login} = collab? (${err})`)
    }

    // remember state
    this.issue = { ...this.context.payload.issue, labels: this.context.payload.issue.labels.map((label: any) => label.name) }
    this.state = this.issue.state
    this.labels = [...this.issue.labels]

    this.isBot = this.context.payload.sender.login.endsWith('[bot]')
    this.ignore = (_.intersection(this.issue.labels, this.config.ignore).length !== 0) || this.isBot
    this.reopen = (_.intersection(this.issue.labels.concat('*'), this.config.reopen).length !== 0)
      && (_.intersection(this.issue.labels.map((label: string) => `-${label}`), this.config.reopen).length === 0)
      && !this.isBot

    return this
  }

  public label(name: string) {
    if (this.labels.includes(name)) return
    this.labels.push(name)
  }

  public unlabel(name: string) {
    this.labels = this.labels.filter(label => label !== name)
  }

  public async save(reason: string) {
    const changed = (this.state !== this.issue.state || !_.isEqual(new Set(this.labels), new Set(this.issue.labels)))
    const msg = `${reason}(${this.context.payload.sender.login}${this.isCollaborator ? '*' : ''}): ${this.issue.state}[${this.issue.labels}] -> ${this.state}[${this.labels}]`

    if (!changed) return

    this.robot.log(`${reason}(${this.context.payload.sender.login}${this.isCollaborator ? '*' : ''}): ${this.issue.state}[${this.issue.labels}] -> ${this.state}[${this.labels}]`)
    await this.context.github.issues.edit(this.context.issue({ state: this.state, labels: this.labels }))
  }
}

module.exports = async (robot: any) => {
  // Your code here
  robot.log('Yay, the app was loaded!')

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/

  robot.on('issue_comment.created', async (context: any) => {
    const req = await (new ProbotRequest(robot, context)).load()

    // if a non-collab comments on a closed issue, re-open it
    if (req.state === 'closed' && !req.isCollaborator && req.reopen) req.state = 'open'

    if (!req.ignore && req.state === 'open') {
      if (req.isCollaborator) {
        req.label(req.config.feedback)
      } else {
        req.unlabel(req.config.feedback)
      }
    }

    await req.save('issue_comment.created')
  })

  robot.on('issues.closed', async (context: any) => {
    const req = await (new ProbotRequest(robot, context)).load()

    if (req.isCollaborator) {
      req.unlabel(req.config.feedback)
    } else if (req.reopen) {
      // if a non-collab closes an issue, re-open it
      req.state = 'open'
    }

    await req.save('issues.closed')
  })

  robot.on('issues.reopened', async (context: any) => {
    const req = await (new ProbotRequest(robot, context)).load()

    if (req.isCollaborator && !req.ignore) req.label(req.config.feedback)

    await req.save('issues.reopend')
  })
}
