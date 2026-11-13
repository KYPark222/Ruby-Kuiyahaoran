class PachinkoEntriesController < ApplicationController
  HOLD_LIMIT = 4
  JACKPOT_DENOMINATOR = 399
  PROCESSED_BALL_LIMIT = 200

  def create
    ball_id = params[:ball_id].to_s
    return render json: { error: "ball_id is required" }, status: :unprocessable_entity if ball_id.blank? || ball_id.length > 80

    processed_ball_ids = Array(session[:pachinko_processed_ball_ids])
    if processed_ball_ids.include?(ball_id)
      return render json: { accepted: false, duplicate: true, hold_count: current_hold_count }, status: :ok
    end

    processed_ball_ids << ball_id
    session[:pachinko_processed_ball_ids] = processed_ball_ids.last(PROCESSED_BALL_LIMIT)
    hold_count = current_hold_count
    if hold_count >= HOLD_LIMIT
      return render json: { accepted: false, full: true, hold_count: hold_count }, status: :ok
    end

    hold_count += 1
    session[:pachinko_hold_count] = hold_count
    render json: { accepted: true, duplicate: false, hold_count: hold_count }
  end

  def consume
    hold_count = current_hold_count
    return render json: { consumed: false, hold_count: hold_count }, status: :ok if hold_count.zero?

    hold_count -= 1
    session[:pachinko_hold_count] = hold_count

    # The TypeScript core draws at entry time and passes draw=false here so the
    # Rails session only mirrors the hold counter. The legacy draw remains the
    # default for environments where the core is disabled.
    unless draw_requested?
      return render json: { consumed: true, hold_count: hold_count, result: nil }, status: :ok
    end

    jackpot = Random.rand(JACKPOT_DENOMINATOR).zero?
    render json: { consumed: true, hold_count: hold_count, result: jackpot ? "jackpot" : "miss" }
  end

  def reset
    session[:pachinko_hold_count] = 0
    session[:pachinko_processed_ball_ids] = []
    head :no_content
  end

  private

  def current_hold_count
    [[session[:pachinko_hold_count].to_i, 0].max, HOLD_LIMIT].min
  end

  def draw_requested?
    draw = params.fetch(:draw, true)
    ActiveModel::Type::Boolean.new.cast(draw) != false
  end
end
